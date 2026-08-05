import { Sequelize, DataTypes, Op } from 'sequelize';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || databaseUrl.includes('db.rbdbzsivydeeujorxzba.supabase.co')) {
  databaseUrl = 'postgres://postgres.rbdbzsivydeeujorxzba:Parinith%401947@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres';
}
let sequelize;

if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
  console.log('Connecting to PostgreSQL database...');
  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    dialectModule: pg,
    protocol: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false
  });
} else {
  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    dialectModule: pg,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false
  });
}

// ── Existing Models ──────────────────────────────────────────

const Student = sequelize.define('Student', {
  id: { type: DataTypes.STRING(50), primaryKey: true, allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  phone: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  room_number: { type: DataTypes.STRING(50), allowNull: false },
  block: { type: DataTypes.STRING(50), allowNull: false },
  join_year: { type: DataTypes.INTEGER, allowNull: false },
  leaving_year: { type: DataTypes.INTEGER, allowNull: true },
  password: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.STRING(20), defaultValue: 'student' },
  status: { type: DataTypes.STRING(20), defaultValue: 'Inactive' },
  suspicious_score: { type: DataTypes.INTEGER, defaultValue: 0 },
  registration_ip: { type: DataTypes.STRING(50), allowNull: true },
  device_fingerprint: { type: DataTypes.STRING(255), allowNull: true },
  joining_date: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
  leaving_date: { type: DataTypes.DATE, allowNull: true }
}, { timestamps: true });

const OTPModel = sequelize.define('OTP', {
  email: { type: DataTypes.STRING(255), allowNull: false },
  otp: { type: DataTypes.STRING(6), allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false }
}, { timestamps: true });

const AttendanceVote = sequelize.define('AttendanceVote', {
  student_id: { type: DataTypes.STRING(50), allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  meal_type: { type: DataTypes.STRING(20), allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false }
}, {
  timestamps: true,
  indexes: [{ unique: true, fields: ['student_id', 'date', 'meal_type'] }]
});

const Absence = sequelize.define('Absence', {
  student_id: { type: DataTypes.STRING(50), allowNull: false },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  return_date: { type: DataTypes.DATEONLY, allowNull: false },
  return_meal: { type: DataTypes.STRING(20), allowNull: false }
}, { timestamps: true });

const LongLeave = sequelize.define('LongLeave', {
  student_id: { type: DataTypes.STRING(50), allowNull: false },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  return_meal: { type: DataTypes.STRING(20), allowNull: false },
  status: { type: DataTypes.STRING(20), defaultValue: 'Pending' }
}, { timestamps: true });

// ── New Models ───────────────────────────────────────────────

// Admin-managed email whitelist — only registered emails can sign up
const AllowedEmail = sequelize.define('AllowedEmail', {
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  added_by: { type: DataTypes.STRING(50), allowNull: true },
  notes: { type: DataTypes.STRING(255), allowNull: true },
  is_verified: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { timestamps: true });

// Global key-value config (voting time windows, etc.)
const SystemConfig = sequelize.define('SystemConfig', {
  key: { type: DataTypes.STRING(100), primaryKey: true, allowNull: false },
  value: { type: DataTypes.STRING(255), allowNull: false }
}, { timestamps: false });

// Admin marks which students are physically verified present for a meal
const AttendanceVerification = sequelize.define('AttendanceVerification', {
  student_id: { type: DataTypes.STRING(50), allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  meal_type: { type: DataTypes.STRING(20), allowNull: false },
  verified_by: { type: DataTypes.STRING(50), allowNull: true },
  is_verified: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  timestamps: true,
  indexes: [{ unique: true, fields: ['student_id', 'date', 'meal_type'] }]
});

// Sequential dinner → breakfast tokens for verified students
const MealToken = sequelize.define('MealToken', {
  student_id: { type: DataTypes.STRING(50), allowNull: false },
  token_for_date: { type: DataTypes.DATEONLY, allowNull: false },   // tomorrow breakfast date
  token_for_meal: { type: DataTypes.STRING(20), allowNull: false }, // 'breakfast'
  source_date: { type: DataTypes.DATEONLY, allowNull: false },      // verification date (tonight)
  source_meal: { type: DataTypes.STRING(20), allowNull: false },    // 'dinner'
  token_number: { type: DataTypes.INTEGER, allowNull: false },
  generated_by: { type: DataTypes.STRING(50), allowNull: true },
  is_redeemed: { type: DataTypes.BOOLEAN, defaultValue: false },
  redeemed_at: { type: DataTypes.DATE, allowNull: true }
}, { timestamps: true });

// ── Relationships ────────────────────────────────────────────

Student.hasMany(AttendanceVote, { foreignKey: 'student_id', onDelete: 'CASCADE' });
AttendanceVote.belongsTo(Student, { foreignKey: 'student_id' });

Student.hasMany(Absence, { foreignKey: 'student_id', onDelete: 'CASCADE' });
Absence.belongsTo(Student, { foreignKey: 'student_id' });

Student.hasMany(LongLeave, { foreignKey: 'student_id', onDelete: 'CASCADE' });
LongLeave.belongsTo(Student, { foreignKey: 'student_id' });

Student.hasMany(AttendanceVerification, { foreignKey: 'student_id', onDelete: 'CASCADE' });
AttendanceVerification.belongsTo(Student, { foreignKey: 'student_id' });

Student.hasMany(MealToken, { foreignKey: 'student_id', onDelete: 'CASCADE' });
MealToken.belongsTo(Student, { foreignKey: 'student_id' });

export {
  sequelize,
  Student, OTPModel, AttendanceVote, Absence, LongLeave, Op,
  AllowedEmail, SystemConfig, AttendanceVerification, MealToken
};
