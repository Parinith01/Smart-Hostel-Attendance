import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// ─── In-memory OTP registry (for dev UI helper only) ────────────────────────
export const devOtpRegistry = {};

// ─── Rate-limit guard: max 3 OTP emails per email address per 10 minutes ────
const emailRateLimit = {};
const RATE_LIMIT_MAX    = 3;
const RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes in ms

function checkRateLimit(email) {
  const now = Date.now();
  const key = email.toLowerCase();

  if (!emailRateLimit[key]) {
    emailRateLimit[key] = [];
  }

  // Remove old timestamps outside the window
  emailRateLimit[key] = emailRateLimit[key].filter(ts => now - ts < RATE_LIMIT_WINDOW);

  if (emailRateLimit[key].length >= RATE_LIMIT_MAX) {
    const oldestTs = emailRateLimit[key][0];
    const waitMs   = RATE_LIMIT_WINDOW - (now - oldestTs);
    const waitMin  = Math.ceil(waitMs / 60000);
    throw new Error(`Too many OTP requests. Please wait ${waitMin} minute(s) before trying again.`);
  }

  emailRateLimit[key].push(now);
}

// ─── Secure reusable transporter ────────────────────────────────────────────
async function createTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587');

  // If proper SMTP credentials are provided, use them
  if (user && pass && !user.includes('your-gmail')) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: true,
      auth: { user, pass },
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }

  // No valid SMTP config – create an Ethereal test account for safe dev preview
  console.log('[SMTP ⚙️] No real SMTP config found – generating Ethereal test account.');
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass
    }
  });
}

// ─── Professional secured HTML email template ────────────────────────────────
function buildOtpHtml(otp, recipientEmail) {
  const year     = new Date().getFullYear();
  const expireAt = new Date(Date.now() + 5 * 60 * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>JSS Hostel Hub – OTP Verification</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:40px 20px;">
    <tr><td align="center">

      <!-- Card -->
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);max-width:520px;width:100%;">

        <!-- Header bar -->
        <tr>
          <td style="background:linear-gradient(135deg,#0d1117 0%,#161b22 100%);padding:30px 40px;text-align:center;">
            <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
              🏛️ JSS MAIN BUILDING BOYS HOSTEL
            </div>
            <div style="font-size:12px;color:#58a6ff;margin-top:6px;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;">
              Smart Attendance System
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 8px;font-size:15px;color:#24292f;font-weight:600;">Hello,</p>
            <p style="margin:0 0 28px;font-size:14px;color:#57606a;line-height:1.6;">
              A verification code has been requested for the account linked to
              <strong style="color:#0969da;">${recipientEmail}</strong>.
              Use the code below to complete your registration.
            </p>

            <!-- OTP Box -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="background:#f6f8fa;border:2px solid #d0d7de;border-radius:12px;padding:28px 20px;">
                  <div style="font-size:11px;font-weight:700;color:#57606a;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
                    Your One-Time Password
                  </div>
                  <div style="font-size:42px;font-weight:900;letter-spacing:12px;color:#0d1117;font-family:'Courier New',monospace;">
                    ${otp}
                  </div>
                  <div style="margin-top:14px;font-size:12px;color:#cf222e;font-weight:600;">
                    ⏱ Expires at ${expireAt} (5 minutes)
                  </div>
                </td>
              </tr>
            </table>

            <div style="margin-top:28px;background:#fff8c5;border:1px solid #d4a72c;border-radius:8px;padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#7d4e00;font-weight:600;">
                ⚠️ Security Notice
              </p>
              <ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:#7d4e00;line-height:1.7;">
                <li>Never share this OTP with anyone — hostel staff will never ask for it.</li>
                <li>This code is single-use and expires in 5 minutes.</li>
                <li>If you did not register, please ignore this email — your data is safe.</li>
              </ul>
            </div>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #d0d7de;"/></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px 30px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#8c959f;">
              This email was automatically generated by the JSS Hostel Smart Attendance System.<br/>
              Do not reply to this email — it is sent from an unmonitored address.
            </p>
            <p style="margin:10px 0 0;font-size:11px;color:#8c959f;">
              © ${year} JSS Main Building Boys Hostel. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
      <!-- End Card -->

    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Main export: sendOtpEmail ───────────────────────────────────────────────
export async function sendOtpEmail(email, otp) {
  const normalizedEmail = email.toLowerCase().trim();

  // Always save to dev registry for the UI OTP helper
  devOtpRegistry[normalizedEmail] = { otp, timestamp: Date.now() };

  // Rate-limit check (throws if exceeded)
  checkRateLimit(normalizedEmail);

  const senderName   = process.env.SMTP_FROM_NAME || 'JSS Hostel Hub';
  const senderEmail  = process.env.SMTP_USER       || 'no-reply@hostelportal.com';
  const fromField    = `"${senderName}" <${senderEmail}>`;

  const mailOptions = {
    from:    fromField,
    to:      normalizedEmail,
    subject: '🔐 Your JSS Hostel Hub Verification Code',
    html:    buildOtpHtml(otp, normalizedEmail),
    headers: {
      'X-Priority':        '1',
      'X-Mailer':          'JSS-Hostel-Hub-v2',
      'X-Content-Type-Options': 'nosniff'
    }
  };

  const transporter = await createTransporter();

  if (transporter) {
    try {
      // Verify connection before sending (skip for Ethereal test account)
      await transporter.verify();
      const info = await transporter.sendMail(mailOptions);
      console.log(`[SMTP ✅] OTP sent to ${normalizedEmail} — Message ID: ${info.messageId}`);
      // If using Ethereal, provide preview URL for developer convenience
      if (process.env.SMTP_USER && process.env.SMTP_PASS && !process.env.SMTP_USER.includes('your-gmail')) {
        return { success: true, messageId: info.messageId };
      } else {
        console.log('[SMTP ℹ️] Ethereal preview URL:', nodemailer.getTestMessageUrl(info));
        return { success: true, previewUrl: nodemailer.getTestMessageUrl(info) };
      }
    } catch (err) {
      console.error(`[SMTP ❌] Failed to send to ${normalizedEmail}:`, err.message);
    }
  }

  // ── Console fallback (dev mode) ──────────────────────────────────────────
  console.log('\n' + '═'.repeat(62));
  console.log(`  📧  OTP EMAIL (DEV FALLBACK) → ${normalizedEmail.toUpperCase()}`);
  console.log(`  ───────────────────────────────────────────────────────────`);
  console.log(`  OTP Code : ${otp}`);
  console.log(`  Expires  : ${new Date(Date.now() + 5 * 60 * 1000).toLocaleTimeString()}`);
  console.log('═'.repeat(62) + '\n');
  return { success: true, fallback: true };
}
