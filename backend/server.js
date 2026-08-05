import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dns from 'dns';
import net from 'net';
import https from 'https';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import dotenv from 'dotenv';
import multer from 'multer';
import xlsx from 'xlsx';
import { PDFParse } from 'pdf-parse';
const pdfParse = PDFParse;
import { 
  sequelize, 
  Student, 
  OTPModel, 
  AttendanceVote, 
  Absence, 
  LongLeave, 
  Op,
  AllowedEmail,
  SystemConfig,
  AttendanceVerification,
  MealToken
} from './database.js';
import { sendOtpEmail } from './mockMailer.js';
import { generateDailyRosterPDF, generateMonthlySummaryPDF } from './pdfGenerator.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const JWT_SECRET = process.env.JWT_SECRET || 'hostel_hub_super_secret_jwt_key_2026';

app.set('trust proxy', 1);

// Global explicit CORS & Preflight middleware
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Helmet — sets secure HTTP response headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Route normalization middleware for Vercel
app.use((req, res, next) => {
  if (req.url.startsWith('/auth') || req.url.startsWith('/student') || req.url.startsWith('/admin')) {
    req.url = '/api' + req.url;
  }
  next();
});

// Health check endpoints
app.get(['/', '/api', '/api/health', '/health'], (req, res) => {
  return res.json({ success: true, status: 'ok', message: 'JSS Hostel Hub API Server is online.' });
});

// ──────────────────────────────────────────
// Rate Limiters
// ──────────────────────────────────────────

// General API rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Strict limiter for login & registration (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again after 15 minutes.' }
});

// OTP / password-reset limiter (tighter)
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please wait 10 minutes before trying again.' }
});

app.use('/api/', globalLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/verify-otp', otpLimiter);
app.use('/api/auth/resend-otp', otpLimiter);
app.use('/api/auth/forgot-password', otpLimiter);
app.use('/api/auth/reset-password', otpLimiter);

// Database Sync
let isSynced = false;
async function ensureDbSynced() {
  if (isSynced) return;
  try {
    await sequelize.sync();
    await seedAdminAccount();
    await seedSystemConfig();
    scheduleAutoExpiry();
    isSynced = true;
    console.log('Database synchronized.');
  } catch (err) {
    console.error('Database synchronization failed:', err);
  }
}

ensureDbSynced();

// Auto-expire students whose leaving_year has passed — runs at server start & midnight daily
function scheduleAutoExpiry() {
  runAutoExpiry(); // Run immediately on start

  if (process.env.VERCEL) return;

  // Schedule to run at midnight every day
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1, 0); // 00:01 next day
  const msUntilMidnight = midnight.getTime() - now.getTime();

  setTimeout(() => {
    runAutoExpiry();
    setInterval(runAutoExpiry, 24 * 60 * 60 * 1000); // then every 24 hours
  }, msUntilMidnight);

  console.log(`[Auto-Expiry] Scheduler started. Next run at midnight (${midnight.toLocaleString()}).`);
}

async function runAutoExpiry() {
  try {
    const currentYear = new Date().getFullYear();

    // Find all Active students whose leaving_year has passed
    const expired = await Student.findAll({
      where: {
        role: 'student',
        status: 'Active',
        leaving_year: { [Op.lte]: currentYear - 1 } // leaving_year strictly in the past
      }
    });

    if (expired.length === 0) {
      console.log(`[Auto-Expiry] No expired students found for year ${currentYear}.`);
      return;
    }

    for (const student of expired) {
      student.status = 'Left Hostel';
      student.leaving_date = new Date();
      await student.save();
      console.log(`[Auto-Expiry] Moved ${student.name} (${student.id}) to Left Hostel — leaving_year was ${student.leaving_year}.`);
    }

    console.log(`[Auto-Expiry] ✅ ${expired.length} student(s) auto-moved to Left Hostel.`);
  } catch (err) {
    console.error('[Auto-Expiry] Error during auto-expiry:', err);
  }
}

// Seed an Admin Account if none exists
async function seedAdminAccount() {
  try {
    const adminExists = await Student.findOne({ where: { role: 'admin' } });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await Student.create({
        id: 'adm9999',
        name: 'System Admin',
        email: 'admin@hostelportal.com',
        phone: '9999999999',
        room_number: 'A-001',
        block: 'Admin Block',
        join_year: 2026,
        password: hashedPassword,
        role: 'admin',
        status: 'Active',
        registration_ip: '127.0.0.1',
        device_fingerprint: 'sys-admin-fingerprint'
      });
      console.log('Admin account seeded: ID "adm9999", Password "admin123"');
    }
  } catch (err) {
    console.error('Failed to seed admin account:', err);
  }
}

async function seedSystemConfig() {
  const defaults = [
    { key: 'breakfast_start', value: '06:00' },
    { key: 'breakfast_end',   value: '09:00' },
    { key: 'dinner_start',   value: '18:00' },
    { key: 'dinner_end',     value: '22:00' },
    { key: 'rebate_rate_per_meal', value: '50' }
  ];
  for (const cfg of defaults) {
    const exists = await SystemConfig.findByPk(cfg.key);
    if (!exists) await SystemConfig.create(cfg);
  }
  console.log('System config seeded.');
}

// Helpers
const DISPOSABLE_DOMAINS = [
  'yopmail.com', 'mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com',
  'dispostable.com', 'getairmail.com', 'sharklasers.com', 'maildrop.cc', 'temp-mail.org',
  'fakeinbox.com', 'throwawaymail.com', 'mailnesia.com', 'mailcatch.com', 'trashmail.com'
];

function isDisposableEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return DISPOSABLE_DOMAINS.includes(domain);
}

async function upsertVote(studentId, dateStr, mealType, status) {
  const existing = await AttendanceVote.findOne({
    where: { student_id: studentId, date: dateStr, meal_type: mealType }
  });
  if (existing) {
    existing.status = status;
    await existing.save();
  } else {
    await AttendanceVote.create({
      student_id: studentId,
      date: dateStr,
      meal_type: mealType,
      status: status
    });
  }
}

// Authentication Middlewares
const authenticateToken = (req, res, next) => {
  let token = req.cookies.token;

  // Fallback: Check Authorization header
  const authHeader = req.headers.authorization;
  if (!token && authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      token = authHeader;
    }
  }

  if (!token) return res.status(401).json({ error: 'Access denied. Please log in.' });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

const requireAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
    }
    next();
  });
};



// ==========================================
// 1. PUBLIC REGISTRATION & AUTHENTICATION
// ==========================================

// Register Student Route
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, room_number, block, join_year, leaving_year, password, fingerprint } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    // Validation
    if (!name || !email || !phone || !room_number || !block || !join_year || !leaving_year || !password) {
      return res.status(400).json({ error: 'All fields are required including joining and leaving year.' });
    }

    if (parseInt(leaving_year) <= parseInt(join_year)) {
      return res.status(400).json({ error: 'Leaving year must be greater than joining year.' });
    }

    const phoneClean = phone.replace(/[^0-9]/g, '');
    if (phoneClean.length !== 10) {
      return res.status(400).json({ error: 'Phone number must be exactly 10 digits.' });
    }

    if (password.length > 8) {
      return res.status(400).json({ error: 'Password must be at most 8 characters.' });
    }

    // 0. Email Whitelist Check
    const emailLowerCheck = email.toLowerCase().trim();
    const isAllowed = await AllowedEmail.findOne({ where: { email: emailLowerCheck } });
    if (!isAllowed) {
      return res.status(403).json({ 
        error: 'your email is not found in admin database so please contact admin' 
      });
    }

    const activeCount = await Student.count({ where: { status: 'Active', role: 'student' } });
    if (activeCount >= 150) {
      return res.status(400).json({ error: 'Registration rejected. The hostel has reached its full capacity of 150 students.' });
    }

    // 2. Uniqueness Checks
    const emailLower = email.toLowerCase().trim();
    const existingEmail = await Student.findOne({ where: { email: emailLower } });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email address is already registered.' });
    }

    const existingPhone = await Student.findOne({ where: { phone } });
    if (existingPhone) {
      return res.status(400).json({ error: 'Phone number is already registered.' });
    }

    // 3. Suspicious Account Scoring
    let score = 0;
    
    // Check same IP count
    const ipCount = await Student.count({ where: { registration_ip: ip } });
    if (ipCount > 0) score += 1;

    // Check device fingerprint
    const fingerprintStr = fingerprint || 'unknown-fingerprint';
    const deviceCount = await Student.count({ where: { device_fingerprint: fingerprintStr } });
    if (deviceCount > 0) score += 3;

    // Check disposable email
    if (isDisposableEmail(emailLower)) {
      score += 3;
    }

    // Check phone reuse attempt (already caught, but let's score attempts or quick duplicates in past)
    const phoneAttempts = await Student.count({ where: { phone } });
    if (phoneAttempts > 0) score += 5;

    // Check multiple registrations from same IP in short duration
    const recentRegs = await Student.count({
      where: {
        registration_ip: ip,
        createdAt: { [Op.gt]: new Date(Date.now() - 5 * 60 * 1000) } // 5 minutes
      }
    });
    if (recentRegs >= 2) score += 2;

    // Auto-generate User ID: first 3 letters of name + last 4 letters of phone
    const cleanName = name.replace(/[^a-zA-Z]/g, '').toLowerCase();
    const namePart = cleanName.substring(0, 3).padEnd(3, 'x');
    const phonePart = phone.replace(/[^0-9]/g, '').slice(-4);
    const userId = `${namePart}${phonePart}`;

    // Verify User ID is unique
    let finalUserId = userId;
    let counter = 1;
    while (await Student.findByPk(finalUserId)) {
      finalUserId = `${userId}${counter}`;
      counter++;
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create Inactive or Suspicious Account
    const initialStatus = score > 5 ? 'Suspicious' : 'Inactive';

    const newStudent = await Student.create({
      id: finalUserId,
      name,
      email: emailLower,
      phone,
      room_number,
      block,
      join_year: parseInt(join_year),
      leaving_year: parseInt(leaving_year),
      password: hashedPassword,
      status: initialStatus,
      suspicious_score: score,
      registration_ip: ip,
      device_fingerprint: fingerprintStr,
      role: 'student'
    });

    // Create and Send OTP (regardless of Suspicious scoring, they verify email first, then admin approves if Suspicious)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await OTPModel.create({
      email: emailLower,
      otp,
      expires_at: expiresAt
    });

    await sendOtpEmail(emailLower, otp);

    return res.json({
      success: true,
      message: 'Account pre-registered. Please verify your email with the OTP sent.',
      userId: finalUserId,
      email: emailLower,
      isSuspicious: score > 5
    });

  } catch (err) {
    console.error('Registration failed:', err);
    return res.status(500).json({ error: 'Server error during registration.' });
  }
});

// Verify OTP Route
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP code are required.' });
    }

    const emailLower = email.toLowerCase().trim();

    // Find the latest active OTP
    const dbOtp = await OTPModel.findOne({
      where: { email: emailLower, otp },
      order: [['createdAt', 'DESC']]
    });

    if (!dbOtp) {
      return res.status(400).json({ error: 'Invalid verification OTP code.' });
    }

    // Check expiry
    if (new Date() > new Date(dbOtp.expires_at)) {
      return res.status(400).json({ error: 'Verification OTP has expired (5-minute limit).' });
    }

    // Activate the student
    const student = await Student.findOne({ where: { email: emailLower } });
    if (!student) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }

    // Delete utilized OTP
    await OTPModel.destroy({ where: { email: emailLower } });

    if (student.status === 'Inactive') {
      student.status = 'Active';
      await student.save();
      return res.json({ success: true, message: 'Email verified successfully! Your account is now active. You may log in.' });
    } else if (student.status === 'Suspicious') {
      return res.json({ 
        success: true, 
        message: 'Email verified! However, due to security flags, your account is queued for administrator review before activation.' 
      });
    }

    return res.json({ success: true, message: 'Email already verified.' });

  } catch (err) {
    console.error('OTP verification failed:', err);
    return res.status(500).json({ error: 'Server error during OTP verification.' });
  }
});

// Resend OTP Route
app.post('/api/auth/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email address is required.' });

    const emailLower = email.toLowerCase().trim();

    // Check if user has received an OTP in the last 60 seconds (rate limiting resend)
    const recentOtp = await OTPModel.findOne({
      where: {
        email: emailLower,
        createdAt: { [Op.gt]: new Date(Date.now() - 60 * 1000) } // 60 seconds
      }
    });

    if (recentOtp) {
      const waitSeconds = Math.max(0, Math.ceil((recentOtp.createdAt.getTime() + 60 * 1000 - Date.now()) / 1000));
      return res.status(429).json({ error: `Please wait ${waitSeconds} seconds before requesting a new OTP.` });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await OTPModel.create({
      email: emailLower,
      otp,
      expires_at: expiresAt
    });

    await sendOtpEmail(emailLower, otp);

    return res.json({ success: true, message: 'A new verification OTP code has been sent to your email.' });

  } catch (err) {
    console.error('OTP resend failed:', err);
    return res.status(500).json({ error: 'Server error during OTP transmission.' });
  }
});

// Login Route
app.post('/api/auth/login', async (req, res) => {
  try {
    await seedAdminAccount();
    const { userId, password } = req.body;

    if (!userId || !password) {
      return res.status(400).json({ error: 'User ID and password are required.' });
    }

    if (userId.length > 7) {
      return res.status(400).json({ error: 'User ID must be at most 7 characters.' });
    }

    if (password.length > 8) {
      return res.status(400).json({ error: 'Password must be at most 8 characters.' });
    }

    // Fetch user
    const student = await Student.findByPk(userId);
    if (!student) {
      return res.status(401).json({ error: 'Invalid User ID or password.' });
    }

    // Check status
    if (student.status === 'Inactive') {
      return res.status(403).json({ error: 'Your email is not verified yet. Please complete verification.' });
    }
    if (student.status === 'Suspicious') {
      return res.status(403).json({ error: 'Your account is under security review by an administrator.' });
    }
    if (student.status === 'Suspended') {
      return res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
    }
    if (student.status === 'Left Hostel') {
      return res.status(403).json({ error: 'Your status is set to Left Hostel. Please contact admin to reactivate.' });
    }

    // Verify Password
    const match = await bcrypt.compare(password, student.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid User ID or password.' });
    }

    // Issue JWT Token inside HTTP-Only cookie
    const token = jwt.sign(
      { id: student.id, role: student.role, name: student.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: student.id,
        name: student.name,
        email: student.email,
        room_number: student.room_number,
        block: student.block,
        role: student.role
      }
    });

  } catch (err) {
    console.error('Login failed:', err);
    return res.status(500).json({ error: 'Server error during login.' });
  }
});

// Forgot Password Request OTP
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { userId, email } = req.body;
    if (!userId || !email) {
      return res.status(400).json({ error: 'User ID and email are required.' });
    }

    if (userId.length > 7) {
      return res.status(400).json({ error: 'User ID must be at most 7 characters.' });
    }

    const emailLower = email.toLowerCase().trim();

    // Verify combination
    const student = await Student.findOne({ where: { id: userId, email: emailLower } });
    if (!student) {
      return res.status(404).json({ error: 'No matching user ID and email found.' });
    }

    // Check status permissions
    if (student.status === 'Suspended' || student.status === 'Left Hostel') {
      return res.status(403).json({ error: 'Unable to reset password for this account. Contact admin.' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await OTPModel.create({
      email: emailLower,
      otp,
      expires_at: expiresAt
    });

    await sendOtpEmail(emailLower, otp);

    return res.json({ success: true, message: 'Reset OTP sent to your registered email.' });

  } catch (err) {
    console.error('Forgot password failed:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// Reset Password Route
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { userId, email, otp, newPassword, confirmPassword } = req.body;

    if (!userId || !email || !otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (userId.length > 7) {
      return res.status(400).json({ error: 'User ID must be at most 7 characters.' });
    }

    if (newPassword.length > 8) {
      return res.status(400).json({ error: 'Password must be at most 8 characters.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const emailLower = email.toLowerCase().trim();

    // Verify OTP
    const dbOtp = await OTPModel.findOne({
      where: { email: emailLower, otp },
      order: [['createdAt', 'DESC']]
    });

    if (!dbOtp) {
      return res.status(400).json({ error: 'Invalid or incorrect OTP code.' });
    }

    if (new Date() > new Date(dbOtp.expires_at)) {
      return res.status(400).json({ error: 'Verification OTP has expired.' });
    }

    // Update Password
    const student = await Student.findOne({ where: { id: userId, email: emailLower } });
    if (!student) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    student.password = hashedPassword;
    await student.save();

    // Clean OTP
    await OTPModel.destroy({ where: { email: emailLower } });

    return res.json({ success: true, message: 'Password has been reset successfully! You can now log in.' });

  } catch (err) {
    console.error('Reset password failed:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// Me Profile Route
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findByPk(req.user.id);
    if (!student) return res.status(404).json({ error: 'User profile not found.' });

    return res.json({
      user: {
        id: student.id,
        name: student.name,
        email: student.email,
        phone: student.phone,
        room_number: student.room_number,
        block: student.block,
        role: student.role,
        status: student.status
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// Logout Route
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully.' });
});


// ==========================================
// 2. STUDENT ACTIONS & VOTING (ABSENCE ENGINE)
// ==========================================

// Get Student Dashboard Details
app.get('/api/student/dashboard', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findByPk(req.user.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const todayStr = new Date().toISOString().split('T')[0];

    // Find today's breakfast and dinner votes
    const votes = await AttendanceVote.findAll({
      where: {
        student_id: student.id,
        date: todayStr
      }
    });

    const breakfastVote = votes.find(v => v.meal_type === 'breakfast')?.status || 'None';
    const dinnerVote = votes.find(v => v.meal_type === 'dinner')?.status || 'None';

    // Calculate remaining absences in the CURRENT month
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

    const absenceCount = await Absence.count({
      where: {
        student_id: student.id,
        createdAt: {
          [Op.between]: [startOfMonth, endOfMonth]
        }
      }
    });

    const remainingAbsences = Math.max(0, 8 - absenceCount);

    // Get long leaves registered
    const activeLeaves = await LongLeave.findAll({
      where: { student_id: student.id },
      order: [['createdAt', 'DESC']]
    });

    return res.json({
      profile: {
        id: student.id,
        name: student.name,
        room_number: student.room_number,
        block: student.block,
        email: student.email,
        status: student.status
      },
      votes: {
        breakfast: breakfastVote,
        dinner: dinnerVote
      },
      absencesRemaining: remainingAbsences,
      leaves: activeLeaves
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Vote Present/Absent for Specific Meal
app.post('/api/student/vote', authenticateToken, async (req, res) => {
  try {
    const { meal_type, status } = req.body;
    const studentId = req.user.id;
    const todayStr = new Date().toISOString().split('T')[0];

    if (!meal_type || !status) {
      return res.status(400).json({ error: 'Meal type and status are required.' });
    }

    // Strict Voting Time-slot Validation
    const configRows = await SystemConfig.findAll();
    const cfg = {};
    configRows.forEach(r => { cfg[r.key] = r.value; });

    const now = new Date();
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const start = cfg[`${meal_type}_start`] || '00:00';
    const end = cfg[`${meal_type}_end`] || '23:59';

    if (currentHHMM < start || currentHHMM > end) {
      return res.status(400).json({ 
        error: `Voting window is closed. You can only vote for ${meal_type} between ${start} and ${end}.` 
      });
    }

    if (status === 'Absent') {
      // 8 absence limit check
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

      const absenceCount = await Absence.count({
        where: {
          student_id: studentId,
          createdAt: { [Op.between]: [startOfMonth, endOfMonth] }
        }
      });

      if (absenceCount >= 8) {
        return res.status(400).json({ error: 'Absence limit reached. You can only record up to 8 absences per month.' });
      }

      // If they vote Absent, it is logged as a direct 1-meal absence instance
      await Absence.create({
        student_id: studentId,
        start_date: todayStr,
        return_date: todayStr,
        return_meal: meal_type === 'breakfast' ? 'dinner' : 'breakfast' // opposite meal return
      });
    }

    // Upsert vote
    const [vote, created] = await AttendanceVote.findOrCreate({
      where: { student_id: studentId, date: todayStr, meal_type },
      defaults: { status }
    });

    if (!created) {
      vote.status = status;
      await vote.save();
    }

    return res.json({ success: true, status });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/student/absence', authenticateToken, async (req, res) => {
  try {
    const { return_date, return_meal, meal_type } = req.body;
    const studentId = req.user.id;
    const todayStr = new Date().toISOString().split('T')[0];

    // Check limit
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

    const absenceCount = await Absence.count({
      where: {
        student_id: studentId,
        createdAt: { [Op.between]: [startOfMonth, endOfMonth] }
      }
    });

    if (absenceCount >= 8) {
      return res.status(400).json({ error: 'Absence limit reached. You can only record up to 8 absence periods/meals per month.' });
    }

    if (meal_type) {
      // Single-meal Today Absence
      await Absence.create({
        student_id: studentId,
        start_date: todayStr,
        return_date: todayStr,
        return_meal: meal_type === 'breakfast' ? 'dinner' : 'breakfast'
      });

      await upsertVote(studentId, todayStr, meal_type, 'Absent');
      return res.json({ success: true, message: 'Absence scheduled for today.' });
    }

    if (!return_date || !return_meal) {
      return res.status(400).json({ error: 'Return date and return meal are required.' });
    }

    // Register Multi-day Absence
    await Absence.create({
      student_id: studentId,
      start_date: todayStr,
      return_date,
      return_meal
    });

    // Populate absences in the database until return date
    let curr = new Date(todayStr);
    const end = new Date(return_date);

    while (curr <= end) {
      const dateStr = curr.toISOString().split('T')[0];

      if (dateStr === return_date) {
        // Return Date Logic
        if (return_meal === 'dinner') {
          // Absent for breakfast, dinner is open (so we log breakfast as Absent)
          await upsertVote(studentId, dateStr, 'breakfast', 'Absent');
        }
        // If return meal is breakfast, nothing is auto-marked for return date (they are back)
      } else {
        // Full absent day
        await upsertVote(studentId, dateStr, 'breakfast', 'Absent');
        await upsertVote(studentId, dateStr, 'dinner', 'Absent');
      }

      curr.setDate(curr.getDate() + 1);
    }

    return res.json({ success: true, message: 'Absence period registered successfully.' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Book Long Leave (Requires Admin Approval)
app.post('/api/student/leave', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, return_meal } = req.body;
    const studentId = req.user.id;

    if (!start_date || !end_date || !return_meal) {
      return res.status(400).json({ error: 'Start date, end date, and return meal are required.' });
    }

    const leave = await LongLeave.create({
      student_id: studentId,
      start_date,
      end_date,
      return_meal,
      status: 'Pending'
    });

    return res.json({ success: true, message: 'Long leave request submitted. Waiting for administrator approval.', leave });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});


// ==========================================
// 3. ADMINISTRATOR OPERATIONS
// ==========================================

// Get Admin Dashboard Overview Metrics
app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    const activeStudents = await Student.count({ where: { status: 'Active', role: 'student' } });
    const leftStudents = await Student.count({ where: { status: 'Left Hostel', role: 'student' } });
    const availableSeats = 150 - activeStudents;

    const recentRegistrations = await Student.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5,
      attributes: ['id', 'name', 'room_number', 'block', 'status', 'createdAt']
    });

    return res.json({
      metrics: {
        activeStudents,
        leftStudents,
        availableSeats,
        capacity: 150
      },
      recentRegistrations
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// List, Search & Filter Students
app.get('/api/admin/students', requireAdmin, async (req, res) => {
  try {
    const { search, status, year, room } = req.query;

    const whereClause = {
      role: 'student'
    };

    if (search) {
      whereClause.name = { [Op.like]: `%${search}%` };
    }
    if (status) {
      whereClause.status = status;
    }
    if (year) {
      whereClause.join_year = parseInt(year);
    }
    if (room) {
      whereClause.room_number = { [Op.like]: `%${room}%` };
    }

    const students = await Student.findAll({
      where: whereClause,
      order: [['room_number', 'ASC'], ['name', 'ASC']]
    });

    return res.json({ students });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Update Student Status (Active, Left Hostel, Suspended, Completed)
app.patch('/api/admin/student/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['Active', 'Left Hostel', 'Suspended', 'Completed', 'Suspicious'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    const student = await Student.findByPk(id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    // Capacity Check: If status is being set to Active, ensure capacity limit is not breached
    if (status === 'Active' && student.status !== 'Active') {
      const activeCount = await Student.count({ where: { status: 'Active', role: 'student' } });
      if (activeCount >= 150) {
        return res.status(400).json({ error: 'Cannot reactivate student. Hostel capacity is full (150 students max).' });
      }
    }

    student.status = status;

    if (status === 'Left Hostel') {
      student.leaving_date = new Date();
    } else if (status === 'Active') {
      // Reactivating old students
      student.leaving_date = null;
    }

    await student.save();

    return res.json({ success: true, message: `Student status updated to ${status}.`, student });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Reactivate Student Endpoint (Convenience/Alias wrapper)
app.post('/api/admin/student/:id/reactivate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findByPk(id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const activeCount = await Student.count({ where: { status: 'Active', role: 'student' } });
    if (activeCount >= 150) {
      return res.status(400).json({ error: 'Hostel maximum capacity has been reached. Please free up a space first.' });
    }

    student.status = 'Active';
    student.leaving_date = null;
    await student.save();

    return res.json({ success: true, message: 'Student has been reactivated successfully.', student });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Delete Student Permanently
app.delete('/api/admin/student/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findByPk(id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    // Clean up dependent tables first to bypass foreign key constraint errors
    await AttendanceVote.destroy({ where: { student_id: id } });
    await Absence.destroy({ where: { student_id: id } });
    await LongLeave.destroy({ where: { student_id: id } });
    await AttendanceVerification.destroy({ where: { student_id: id } });
    await MealToken.destroy({ where: { student_id: id } });

    await student.destroy();
    return res.json({ success: true, message: 'Student deleted permanently from the database.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get Suspicious Accounts List (with Registration IP & Device Fingerprints)
app.get('/api/admin/suspicious', requireAdmin, async (req, res) => {
  try {
    const suspiciousAccounts = await Student.findAll({
      where: {
        [Op.or]: [
          { status: 'Suspicious' },
          { suspicious_score: { [Op.gt]: 5 } }
        ]
      },
      order: [['suspicious_score', 'DESC']]
    });

    return res.json({ suspiciousAccounts });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Action suspicious account (approve, reject/delete, ban)
app.post('/api/admin/suspicious/:id/action', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approve', 'reject', 'ban'

    const student = await Student.findByPk(id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    if (action === 'approve') {
      const activeCount = await Student.count({ where: { status: 'Active', role: 'student' } });
      if (activeCount >= 150) {
        return res.status(400).json({ error: 'Capacity is full. Cannot approve user registration.' });
      }
      student.status = 'Active';
      await student.save();
      return res.json({ success: true, message: 'Account approved successfully.' });

    } else if (action === 'reject') {
      await student.destroy();
      return res.json({ success: true, message: 'Account registration rejected and deleted.' });

    } else if (action === 'ban') {
      student.status = 'Suspended';
      await student.save();
      return res.json({ success: true, message: 'Account has been banned.' });
    }

    return res.status(400).json({ error: 'Invalid action.' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get All Long Leaves
app.get('/api/admin/leave-requests', requireAdmin, async (req, res) => {
  try {
    const requests = await LongLeave.findAll({
      include: [{ model: Student, attributes: ['id', 'name', 'room_number', 'block'] }],
      order: [['createdAt', 'DESC']]
    });

    return res.json({ requests });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Action Long Leave (Approve/Reject)
app.post('/api/admin/leave-requests/:id/action', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'Approve', 'Reject'

    const leave = await LongLeave.findByPk(id);
    if (!leave) return res.status(404).json({ error: 'Leave request not found.' });

    if (action === 'Approve') {
      leave.status = 'Approved';
      await leave.save();

      // Automatically register absent records in AttendanceVotes for leave duration
      let curr = new Date(leave.start_date);
      const end = new Date(leave.end_date);

      while (curr <= end) {
        const dateStr = curr.toISOString().split('T')[0];

        if (dateStr === leave.end_date) {
          // Return Date Logic
          if (leave.return_meal === 'dinner') {
            await upsertVote(leave.student_id, dateStr, 'breakfast', 'Absent');
          }
        } else {
          // Full absent day
          await upsertVote(leave.student_id, dateStr, 'breakfast', 'Absent');
          await upsertVote(leave.student_id, dateStr, 'dinner', 'Absent');
        }

        curr.setDate(curr.getDate() + 1);
      }

      return res.json({ success: true, message: 'Leave approved and absences registered.' });

    } else if (action === 'Reject') {
      leave.status = 'Rejected';
      await leave.save();
      return res.json({ success: true, message: 'Leave request rejected.' });
    }

    return res.status(400).json({ error: 'Invalid action.' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});


// ==========================================
// 4. STUDENT – CHANGE PASSWORD
// ==========================================
app.put('/api/student/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword)
      return res.status(400).json({ error: 'All fields are required.' });
    if (newPassword !== confirmPassword)
      return res.status(400).json({ error: 'New passwords do not match.' });

    if (newPassword.length > 8) {
      return res.status(400).json({ error: 'New password must be at most 8 characters.' });
    }

    const student = await Student.findByPk(req.user.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const match = await bcrypt.compare(currentPassword, student.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    student.password = await bcrypt.hash(newPassword, 10);
    await student.save();
    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// Get student's active token (for today or tomorrow breakfast)
app.get('/api/student/my-token', authenticateToken, async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    
    const token = await MealToken.findOne({
      where: { 
        student_id: req.user.id, 
        token_for_date: { [Op.or]: [todayStr, tomorrowStr] }, 
        token_for_meal: 'breakfast' 
      },
      order: [['token_for_date', 'ASC']]
    });
    
    if (!token) {
      return res.json({ token: null });
    }

    // Parse local Date elements safely
    const [year, month, day] = token.token_for_date.split('-').map(Number);
    const expiryTime = new Date(year, month - 1, day, 13, 0, 0); // 13:00 local time
    const isExpired = new Date() > expiryTime;

    return res.json({ 
      token: {
        id: token.id,
        student_id: token.student_id,
        token_for_date: token.token_for_date,
        token_for_meal: token.token_for_meal,
        token_number: token.token_number,
        is_redeemed: token.is_redeemed,
        redeemed_at: token.redeemed_at,
        isExpired
      } 
    });
  } catch (err) {
    console.error('Error in my-token:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

app.get('/api/student/rebates', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

    const rateRow = await SystemConfig.findByPk('rebate_rate_per_meal');
    const rebateRate = rateRow ? parseFloat(rateRow.value) : 50.0;

    const absentVotes = await AttendanceVote.findAll({
      where: {
        student_id: studentId,
        status: 'Absent',
        date: {
          [Op.between]: [
            startOfMonth.toISOString().split('T')[0],
            endOfMonth.toISOString().split('T')[0]
          ]
        }
      },
      order: [['date', 'DESC'], ['meal_type', 'ASC']]
    });

    const totalSkipped = absentVotes.length;
    const totalRebate = totalSkipped * rebateRate;

    return res.json({
      success: true,
      rebateRate,
      totalSkipped,
      totalRebate,
      skips: absentVotes.map(v => ({
        date: v.date,
        meal: v.meal_type
      }))
    });
  } catch (err) {
    console.error('Error fetching student rebates:', err);
    return res.status(500).json({ error: 'Server error fetching rebates.' });
  }
});

// Get system config (public – students need time windows)
app.get('/api/config/system', async (req, res) => {
  try {
    const rows = await SystemConfig.findAll();
    const cfg = {};
    rows.forEach(r => { cfg[r.key] = r.value; });
    return res.json({ config: cfg });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ==========================================
// 5. ADMIN – ALLOWED EMAIL WHITELIST
// ==========================================
app.get('/api/admin/allowed-emails', requireAdmin, async (req, res) => {
  try {
    const emails = await AllowedEmail.findAll({ order: [['createdAt', 'DESC']] });
    return res.json({ emails });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/admin/allowed-emails', requireAdmin, async (req, res) => {
  try {
    const { email, notes } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    const emailLower = email.toLowerCase().trim();
    if (!emailLower.endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Only Gmail addresses (@gmail.com) are allowed.' });
    }
    const existing = await AllowedEmail.findOne({ where: { email: emailLower } });
    if (existing) return res.status(400).json({ error: 'Email already in whitelist.' });
    const entry = await AllowedEmail.create({ email: emailLower, added_by: req.user.id, notes: notes || '' });
    return res.json({ success: true, entry });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// Helper to verify if an email exists and is authentic (checks Gmail domain/syntax, Google gxlu API, DNS MX records, and SMTP handshake)
function verifyEmailExists(email) {
  return new Promise(async (resolve) => {
    // 1. Basic Email Syntax check
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return resolve(false);
    }

    const [username, domain] = email.toLowerCase().split('@');

    // 2. Strict Gmail domain check (Only @gmail.com is permitted)
    if (domain !== 'gmail.com') {
      return resolve(false);
    }

    // 3. Gmail Username syntax & length constraints
    const cleanUsername = username.split('+')[0].replace(/\./g, '');
    // Gmail username must be between 6 and 30 characters
    if (cleanUsername.length < 6 || cleanUsername.length > 30) {
      return resolve(false);
    }
    // Must only contain alphanumeric characters
    if (!/^[a-z0-9]+$/.test(cleanUsername)) {
      return resolve(false);
    }

    // 4. Google gxlu HTTP check (highly reliable over port 443)
    const existsViaGxlu = await new Promise((resGxlu) => {
      https.get(`https://mail.google.com/mail/gxlu?email=${encodeURIComponent(email)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      }, (res) => {
        const cookies = res.headers['set-cookie'] || [];
        const hasCompass = cookies.some(cookie => cookie.includes('COMPASS'));
        resGxlu(hasCompass);
      }).on('error', () => {
        resGxlu(null); // Network error, skip gxlu check
      });
    });

    if (existsViaGxlu === true) {
      // Confirmed exists via Google's server
      return resolve(true);
    }

    // If existsViaGxlu is false or null, it is inconclusive (e.g., rate-limited, no cookies returned).
    // We fall back to DNS MX & SMTP Handshake verification instead of rejecting immediately.

    // 5. Fallback DNS MX & SMTP Handshake Check (in case gxlu failed with network error)
    dns.resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        return resolve(false);
      }

      addresses.sort((a, b) => a.priority - b.priority);
      const primaryExchange = addresses[0].exchange;

      const socket = net.createConnection(25, primaryExchange);
      socket.setTimeout(2500);

      let step = 0;
      let resolved = false;

      const finish = (isValid) => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        resolve(isValid);
      };

      socket.on('connect', () => {});

      socket.on('data', (data) => {
        const response = data.toString();
        const code = parseInt(response.substring(0, 3));

        if (step === 0) {
          if (code === 220) {
            socket.write('EHLO localhost\r\n');
            step = 1;
          } else {
            finish(true);
          }
        } else if (step === 1) {
          if (code === 250) {
            socket.write('MAIL FROM:<admin@hostelportal.com>\r\n');
            step = 2;
          } else {
            finish(true);
          }
        } else if (step === 2) {
          if (code === 250) {
            socket.write(`RCPT TO:<${email}>\r\n`);
            step = 3;
          } else {
            finish(true);
          }
        } else if (step === 3) {
          if (code === 250) {
            finish(true);
          } else if (code === 550 || code === 553 || code === 551 || code === 554) {
            finish(false);
          } else {
            finish(true);
          }
        }
      });

      socket.on('error', () => finish(true));
      socket.on('timeout', () => finish(true));
    });
  });
}

app.post('/api/admin/allowed-emails/verify-single', requireAdmin, async (req, res) => {
  try {
    const { id, email } = req.body;
    let entry = null;

    if (id) {
      entry = await AllowedEmail.findByPk(id);
    }
    if (!entry && email) {
      entry = await AllowedEmail.findOne({ where: { email: email.toLowerCase().trim() } });
    }

    if (!entry) return res.status(404).json({ error: 'Entry not found.' });

    const emailLower = entry.email.toLowerCase().trim();

    // 1. Enforce strict Gmail check
    if (!emailLower.endsWith('@gmail.com')) {
      await entry.destroy();
      return res.json({ success: true, removed: true, reason: 'Not Gmail' });
    }

    // 2. Check and remove any duplicates if they somehow exist
    const duplicate = await AllowedEmail.findOne({
      where: {
        email: emailLower,
        id: { [Op.ne]: entry.id }
      }
    });
    if (duplicate) {
      await entry.destroy();
      return res.json({ success: true, removed: true, reason: 'Duplicate' });
    }

    // 3. Optimization: If already verified, skip verification network check
    if (entry.is_verified) {
      return res.json({ success: true, verified: true });
    }

    // 4. Verify email existence
    const isValid = await verifyEmailExists(entry.email);
    if (!isValid) {
      await entry.destroy();
      return res.json({ success: true, removed: true, reason: 'Invalid Email' });
    }

    entry.is_verified = true;
    await entry.save();
    return res.json({ success: true, verified: true });
  } catch (err) {
    console.error('Error verifying single email:', err);
    return res.status(500).json({ error: 'Server error verifying email.' });
  }
});

app.post('/api/admin/allowed-emails/verify-bulk', requireAdmin, async (req, res) => {
  try {
    const entries = await AllowedEmail.findAll();
    let checkedCount = 0;
    let removedCount = 0;
    const removedEmails = [];
    const seenEmails = new Set();

    // Run verification sequentially
    for (const entry of entries) {
      checkedCount++;
      const emailLower = entry.email.toLowerCase().trim();

      // Remove duplicate case-insensitively
      if (seenEmails.has(emailLower)) {
        await entry.destroy();
        removedCount++;
        removedEmails.push(`${entry.email} (Duplicate)`);
        continue;
      }
      seenEmails.add(emailLower);

      // Enforce strict Gmail check on existing whitelist entries in database
      if (!emailLower.endsWith('@gmail.com')) {
        await entry.destroy();
        removedCount++;
        removedEmails.push(`${entry.email} (Not Gmail)`);
        continue;
      }

      // Optimization: If already verified, skip verification network check
      if (entry.is_verified) {
        continue;
      }

      const isValid = await verifyEmailExists(entry.email);
      if (!isValid) {
        await entry.destroy();
        removedCount++;
        removedEmails.push(entry.email);
      } else {
        entry.is_verified = true;
        await entry.save();
      }
    }

    return res.json({
      success: true,
      checkedCount,
      removedCount,
      removedEmails,
      message: `Bulk verification complete. Checked ${checkedCount} email(s) and removed ${removedCount} fake, duplicate, or invalid account(s).`
    });
  } catch (err) {
    console.error('Error during bulk email verification:', err);
    return res.status(500).json({ error: 'Server error during bulk verification.' });
  }
});

// Helper to extract text from PDF using either class-based or function-based pdf-parse
async function extractPdfText(buffer) {
  const pdfLib = pdfParse;
  try {
    if (pdfLib && pdfLib.PDFParse) {
      const instance = new pdfLib.PDFParse(new Uint8Array(buffer));
      const res = await instance.getText();
      return res.text || '';
    }
  } catch (err) {
    console.warn('Class-based PDF parsing fallback failed:', err);
  }

  if (typeof pdfLib === 'function') {
    const res = await pdfLib(buffer);
    return res.text || '';
  } else if (pdfLib && pdfLib.default && typeof pdfLib.default === 'function') {
    const res = await pdfLib.default(buffer);
    return res.text || '';
  }
  throw new Error('No valid PDF parsing interface found in the loaded pdf-parse module.');
}

// Configure memory storage for multer file upload
const upload = multer({ storage: multer.memoryStorage() });

// Bulk Upload Allowed Emails (XLSX, XLS, CSV, TXT, PDF)
app.post('/api/admin/allowed-emails/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const buffer = req.file.buffer;
    const filename = req.file.originalname.toLowerCase();
    let text = '';

    if (filename.endsWith('.csv') || filename.endsWith('.txt')) {
      text = buffer.toString('utf-8');
    } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        text += xlsx.utils.sheet_to_csv(sheet) + '\n';
      }
    } else if (filename.endsWith('.pdf')) {
      text = await extractPdfText(buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Please upload XLSX, XLS, CSV, TXT, or PDF.' });
    }

    // Extract all email addresses using regex
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const foundEmails = text.match(emailRegex) || [];
    
    // De-duplicate, normalize and strictly filter to @gmail.com domains
    const uniqueEmails = [...new Set(
      foundEmails
        .map(e => e.toLowerCase().trim())
        .filter(e => e.endsWith('@gmail.com'))
    )];

    if (uniqueEmails.length === 0) {
      return res.status(400).json({ error: 'No valid Gmail addresses (@gmail.com) found in the uploaded file.' });
    }

    // Fetch existing whitelisted emails
    const existingEntries = await AllowedEmail.findAll({ attributes: ['email'] });
    const existingEmailsSet = new Set(existingEntries.map(e => e.email));

    // Filter to new emails
    const newEmails = uniqueEmails.filter(email => !existingEmailsSet.has(email));

    if (newEmails.length === 0) {
      return res.json({ success: true, count: 0, totalFound: uniqueEmails.length, message: 'All emails in the file are already whitelisted.' });
    }

    // Insert new emails in database
    const addedEntries = [];
    for (const email of newEmails) {
      const entry = await AllowedEmail.create({
        email,
        added_by: req.user.id,
        notes: `Bulk imported via ${req.file.originalname}`
      });
      addedEntries.push(entry);
    }

    return res.json({
      success: true,
      count: addedEntries.length,
      totalFound: uniqueEmails.length,
      message: `Successfully whitelisted ${addedEntries.length} new email(s).`
    });

  } catch (err) {
    console.error('Bulk upload error:', err);
    return res.status(500).json({ error: 'Server error processing file: ' + err.message });
  }
});


app.get('/api/admin/allowed-emails/imports', requireAdmin, async (req, res) => {
  try {
    const imports = await AllowedEmail.findAll({
      where: {
        notes: {
          [Op.like]: 'Bulk imported via %'
        }
      },
      attributes: [
        'notes',
        [sequelize.fn('COUNT', sequelize.col('email')), 'count']
      ],
      group: ['notes']
    });

    const files = imports.map(item => {
      const notesStr = item.get('notes') || '';
      const filename = notesStr.replace('Bulk imported via ', '');
      return {
        filename,
        count: item.get('count')
      };
    });

    return res.json({ imports: files });
  } catch (err) {
    console.error('Error fetching bulk imports:', err);
    return res.status(500).json({ error: 'Server error fetching imports.' });
  }
});

app.post('/api/admin/allowed-emails/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required.' });
    }

    const count = await AllowedEmail.destroy({
      where: {
        notes: `Bulk imported via ${filename}`
      }
    });

    return res.json({ success: true, message: `Removed all ${count} email(s) imported from ${filename}.` });
  } catch (err) {
    console.error('Error bulk deleting emails:', err);
    return res.status(500).json({ error: 'Server error bulk deleting emails.' });
  }
});

app.delete('/api/admin/allowed-emails/:idOrEmail', requireAdmin, async (req, res) => {
  try {
    const { idOrEmail } = req.params;
    let entry = null;
    if (idOrEmail.includes('@')) {
      entry = await AllowedEmail.findOne({ where: { email: idOrEmail.toLowerCase().trim() } });
    } else {
      entry = await AllowedEmail.findByPk(idOrEmail);
      if (!entry) {
        entry = await AllowedEmail.findOne({ where: { email: idOrEmail.toLowerCase().trim() } });
      }
    }
    if (!entry) return res.status(404).json({ error: 'Entry not found.' });
    await entry.destroy();
    return res.json({ success: true, message: 'Email removed from whitelist.' });
  } catch (err) {
    console.error('Error removing email:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ==========================================
// 6. ADMIN – SYSTEM CONFIG (TIME WINDOWS)
// ==========================================
app.get('/api/admin/system-config', requireAdmin, async (req, res) => {
  try {
    const rows = await SystemConfig.findAll();
    const cfg = {};
    rows.forEach(r => { cfg[r.key] = r.value; });
    return res.json({ config: cfg });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

app.put('/api/admin/system-config', requireAdmin, async (req, res) => {
  try {
    const { breakfast_start, breakfast_end, dinner_start, dinner_end, rebate_rate_per_meal } = req.body;
    const updates = { breakfast_start, breakfast_end, dinner_start, dinner_end, rebate_rate_per_meal };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        await SystemConfig.upsert({ key, value });
      }
    }
    return res.json({ success: true, message: 'Configuration updated.' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// Revoke student absence and allow them to vote again
app.post('/api/admin/revoke-absence', requireAdmin, async (req, res) => {
  try {
    const { student_id, date, meal_type } = req.body;
    if (!student_id || !date || !meal_type) {
      return res.status(400).json({ error: 'student_id, date, and meal_type are required.' });
    }

    // Delete the AttendanceVote row for this date and meal
    await AttendanceVote.destroy({
      where: {
        student_id,
        date,
        meal_type
      }
    });

    // Also delete any single-day Absence record for today to restore their absence limit quota
    await Absence.destroy({
      where: {
        student_id,
        start_date: date,
        return_date: date
      }
    });

    // Delete verification if it exists (since they are resetting to not voted)
    await AttendanceVerification.destroy({
      where: {
        student_id,
        date,
        meal_type
      }
    });

    return res.json({ success: true, message: 'Absence revoked successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error revoking absence.' });
  }
});

// ==========================================
// 7. ADMIN – LIVE ATTENDANCE ROSTER + VERIFY
// ==========================================
app.get('/api/admin/attendance-roster', requireAdmin, async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const students = await Student.findAll({
      where: { role: 'student', status: 'Active' },
      order: [['room_number', 'ASC'], ['name', 'ASC']]
    });

    const votes = await AttendanceVote.findAll({ where: { date: targetDate } });
    const verifications = await AttendanceVerification.findAll({ where: { date: targetDate } });
    const tomorrowStr = new Date(new Date(targetDate).getTime() + 86400000).toISOString().split('T')[0];
    const tokens = await MealToken.findAll({ where: { token_for_date: tomorrowStr } });

    // Fetch all active approved long leaves for targetDate
    const activeLeaves = await LongLeave.findAll({
      where: {
        status: 'Approved',
        start_date: { [Op.lte]: targetDate },
        end_date: { [Op.gte]: targetDate }
      }
    });

    const roster = students.map(s => {
      const bVote = votes.find(v => v.student_id === s.id && v.meal_type === 'breakfast');
      const dVote = votes.find(v => v.student_id === s.id && v.meal_type === 'dinner');
      const bVerify = verifications.find(v => v.student_id === s.id && v.meal_type === 'breakfast');
      const dVerify = verifications.find(v => v.student_id === s.id && v.meal_type === 'dinner');
      const tok = tokens.find(t => t.student_id === s.id);
      const onLeave = activeLeaves.some(l => l.student_id === s.id);

      return {
        id: s.id, name: s.name, room_number: s.room_number, block: s.block,
        breakfast_vote: bVote?.status || 'Not Voted',
        dinner_vote: dVote?.status || 'Not Voted',
        breakfast_verified: !!bVerify?.is_verified,
        dinner_verified: !!dVerify?.is_verified,
        token: tok ? { number: tok.token_number, for_date: tok.token_for_date } : null,
        on_leave: onLeave
      };
    });

    const bCount = verifications.filter(v => v.meal_type === 'breakfast' && v.is_verified).length;
    const dCount = verifications.filter(v => v.meal_type === 'dinner' && v.is_verified).length;

    const bpVoted = roster.filter(r => r.breakfast_vote === 'Present').length;
    const dpVoted = roster.filter(r => r.dinner_vote === 'Present').length;

    return res.json({ 
      roster, 
      date: targetDate, 
      verifiedBreakfast: bCount, 
      verifiedDinner: dCount,
      votedPresentBreakfast: bpVoted,
      votedPresentDinner: dpVoted
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// Toggle verification for a student meal
app.post('/api/admin/verify-attendance', requireAdmin, async (req, res) => {
  try {
    const { student_id, date, meal_type, verify } = req.body;
    if (!student_id || !date || !meal_type)
      return res.status(400).json({ error: 'student_id, date, meal_type required.' });

    if (verify) {
      await AttendanceVerification.upsert({
        student_id, date, meal_type,
        verified_by: req.user.id,
        is_verified: true
      });
    } else {
      await AttendanceVerification.destroy({ where: { student_id, date, meal_type } });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ==========================================
// 8. ADMIN – TOKEN GENERATION
// ==========================================
app.post('/api/admin/generate-tokens', requireAdmin, async (req, res) => {
  try {
    const { source_date, source_meal } = req.body;
    if (!source_date || !source_meal)
      return res.status(400).json({ error: 'source_date and source_meal required.' });

    // Token is FOR tomorrow breakfast
    const tomorrowStr = new Date(new Date(source_date).getTime() + 86400000).toISOString().split('T')[0];

    // Check tokens not already generated for this date+meal
    const existing = await MealToken.count({ where: { source_date, source_meal } });
    if (existing > 0) {
      return res.status(400).json({ error: 'Tokens already generated for this date and meal.' });
    }

    // Get all verified students for that meal
    const verifiedList = await AttendanceVerification.findAll({
      where: { date: source_date, meal_type: source_meal, is_verified: true },
      include: [{ model: Student, attributes: ['id', 'name'] }]
    });

    if (verifiedList.length === 0)
      return res.status(400).json({ error: 'No verified students found for this meal.' });

    // Assign sequential tokens
    const created = [];
    for (let i = 0; i < verifiedList.length; i++) {
      const v = verifiedList[i];
      const tok = await MealToken.create({
        student_id: v.student_id,
        token_for_date: tomorrowStr,
        token_for_meal: 'breakfast',
        source_date,
        source_meal,
        token_number: i + 1,
        generated_by: req.user.id
      });
      created.push(tok);
    }

    return res.json({ success: true, message: `${created.length} tokens generated.`, tokens: created.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// Get tokens for a date (admin view)
app.get('/api/admin/tokens', requireAdmin, async (req, res) => {
  try {
    const { source_date, source_meal } = req.query;
    const where = {};
    if (source_date) where.source_date = source_date;
    if (source_meal) where.source_meal = source_meal;

    const tokens = await MealToken.findAll({
      where,
      include: [{ model: Student, attributes: ['id', 'name', 'room_number', 'block'] }],
      order: [['token_number', 'ASC']]
    });
    return res.json({ tokens });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/admin/tokens/verify-pass', requireAdmin, async (req, res) => {
  try {
    const { tokenNumber, studentId, token_for_date, token_for_meal } = req.body;
    if (!studentId || !tokenNumber || !token_for_date || !token_for_meal) {
      return res.status(400).json({ error: 'All token properties (studentId, tokenNumber, token_for_date, token_for_meal) are required.' });
    }

    const token = await MealToken.findOne({
      where: {
        student_id: studentId,
        token_number: parseInt(tokenNumber),
        token_for_date,
        token_for_meal
      },
      include: [{ model: Student, attributes: ['name', 'room_number', 'block'] }]
    });

    if (!token) {
      return res.status(404).json({ success: false, reason: 'Invalid Pass' });
    }

    if (token.is_redeemed) {
      const timeStr = token.redeemed_at ? new Date(token.redeemed_at).toLocaleTimeString() : 'earlier';
      return res.status(200).json({ 
        success: false, 
        reason: 'Pass already scanned', 
        studentName: token.Student?.name, 
        redeemedAt: timeStr 
      });
    }

    token.is_redeemed = true;
    token.redeemed_at = new Date();
    await token.save();

    return res.json({ 
      success: true, 
      message: 'Access Granted',
      studentName: token.Student?.name,
      roomNumber: token.Student?.room_number,
      block: token.Student?.block,
      tokenNumber: token.token_number,
      meal: token.token_for_meal
    });
  } catch (err) {
    console.error('Error verifying pass:', err);
    return res.status(500).json({ error: 'Server error verifying pass.' });
  }
});

// Route: Daily Attendance PDF Report
app.get('/api/admin/report/daily', requireAdmin, async (req, res) => {
  try {
    const { date, meal_type } = req.query;
    if (!date || !meal_type) {
      return res.status(400).json({ error: 'date and meal_type parameters are required.' });
    }

    const students = await Student.findAll({
      where: { role: 'student', status: 'Active' },
      order: [['room_number', 'ASC'], ['name', 'ASC']]
    });

    const votes = await AttendanceVote.findAll({ where: { date } });
    const verifications = await AttendanceVerification.findAll({ where: { date } });

    // Fetch active approved long leaves for this date
    const activeLeaves = await LongLeave.findAll({
      where: {
        status: 'Approved',
        start_date: { [Op.lte]: date },
        end_date: { [Op.gte]: date }
      }
    });

    const roster = students.map(s => {
      const bVote = votes.find(v => v.student_id === s.id && v.meal_type === 'breakfast');
      const dVote = votes.find(v => v.student_id === s.id && v.meal_type === 'dinner');
      const bVerify = verifications.find(v => v.student_id === s.id && v.meal_type === 'breakfast');
      const dVerify = verifications.find(v => v.student_id === s.id && v.meal_type === 'dinner');
      const onLeave = activeLeaves.some(l => l.student_id === s.id);
      return {
        id: s.id,
        name: s.name,
        room_number: s.room_number,
        block: s.block,
        breakfast_vote: bVote?.status || 'Not Voted',
        dinner_vote: dVote?.status || 'Not Voted',
        breakfast_verified: !!bVerify?.is_verified,
        dinner_verified: !!dVerify?.is_verified,
        on_leave: onLeave
      };
    });

    generateDailyRosterPDF(res, date, meal_type.toLowerCase(), roster);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error generating daily report.' });
  }
});

// Route: Monthly Attendance PDF Report
app.get('/api/admin/report/monthly', requireAdmin, async (req, res) => {
  try {
    const { month } = req.query; // format: YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Valid month parameter (YYYY-MM) is required.' });
    }

    const students = await Student.findAll({
      where: { role: 'student' },
      order: [['room_number', 'ASC'], ['name', 'ASC']]
    });

    // Fetch all votes for this month
    const votes = await AttendanceVote.findAll({
      where: {
        date: { [Op.like]: `${month}-%` }
      }
    });

    const summaryData = students.map(s => {
      const studentVotes = votes.filter(v => v.student_id === s.id);
      
      const bPresent = studentVotes.filter(v => v.meal_type === 'breakfast' && v.status === 'Present').length;
      const bAbsent = studentVotes.filter(v => v.meal_type === 'breakfast' && v.status === 'Absent').length;
      
      const dPresent = studentVotes.filter(v => v.meal_type === 'dinner' && v.status === 'Present').length;
      const dAbsent = studentVotes.filter(v => v.meal_type === 'dinner' && v.status === 'Absent').length;

      return {
        id: s.id,
        name: s.name,
        room_number: s.room_number,
        block: s.block,
        bPresent,
        bAbsent,
        dPresent,
        dAbsent
      };
    });

    generateMonthlySummaryPDF(res, month, summaryData);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error generating monthly report.' });
  }
});

app.get('/api/admin/report/weekly-stats', requireAdmin, async (req, res) => {
  try {
    const stats = [];
    const today = new Date();
    
    // Get stats for the past 7 days (including today)
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      // Query active student count on that day
      const totalStudents = await Student.count({ where: { role: 'student', status: 'Active' } });

      // Breakfast present votes & verified
      const bVotes = await AttendanceVote.count({ where: { date: dateStr, meal_type: 'breakfast', status: 'Present' } });
      const bVerify = await AttendanceVerification.count({ where: { date: dateStr, meal_type: 'breakfast', is_verified: true } });

      // Dinner present votes & verified
      const dVotes = await AttendanceVote.count({ where: { date: dateStr, meal_type: 'dinner', status: 'Present' } });
      const dVerify = await AttendanceVerification.count({ where: { date: dateStr, meal_type: 'dinner', is_verified: true } });

      // Absent count
      const bAbsent = await AttendanceVote.count({ where: { date: dateStr, meal_type: 'breakfast', status: 'Absent' } });
      const dAbsent = await AttendanceVote.count({ where: { date: dateStr, meal_type: 'dinner', status: 'Absent' } });

      stats.push({
        date: dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        totalStudents,
        breakfast: {
          votedPresent: bVotes,
          verified: bVerify,
          absent: bAbsent
        },
        dinner: {
          votedPresent: dVotes,
          verified: dVerify,
          absent: dAbsent
        }
      });
    }

    return res.json({ success: true, stats });
  } catch (err) {
    console.error('Error fetching weekly stats:', err);
    return res.status(500).json({ error: 'Server error fetching weekly stats.' });
  }
});

app.get('/api/admin/rebates/summary', requireAdmin, async (req, res) => {
  try {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

    const rateRow = await SystemConfig.findByPk('rebate_rate_per_meal');
    const rebateRate = rateRow ? parseFloat(rateRow.value) : 50.0;

    const students = await Student.findAll({
      where: { role: 'student', status: 'Active' },
      order: [['room_number', 'ASC'], ['name', 'ASC']]
    });

    const absentVotes = await AttendanceVote.findAll({
      where: {
        status: 'Absent',
        date: {
          [Op.between]: [
            startOfMonth.toISOString().split('T')[0],
            endOfMonth.toISOString().split('T')[0]
          ]
        }
      }
    });

    const summary = students.map(s => {
      const studentSkips = absentVotes.filter(v => v.student_id === s.id);
      const skipCount = studentSkips.length;
      return {
        id: s.id,
        name: s.name,
        room_number: s.room_number,
        block: s.block,
        skipCount,
        rebateAmount: skipCount * rebateRate
      };
    });

    return res.json({
      success: true,
      rebateRate,
      summary
    });
  } catch (err) {
    console.error('Error fetching rebates summary:', err);
    return res.status(500).json({ error: 'Server error fetching rebates summary.' });
  }
});

import { fileURLToPath } from 'url';

// Start Server if executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  app.listen(PORT, () => {
    console.log(`Hostel Backend running on port ${PORT}`);
  });
}

export default app;

