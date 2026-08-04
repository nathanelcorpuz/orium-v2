import nodemailer from "nodemailer";

// T271 (user request 2026-08-04): "Now that we're going to use nodemailer,
// we can easily implement the code stuff don't we?" Replaces reliance on
// Supabase Auth's own "Confirm signup" email (blocked from editing or
// raising its rate limit without custom SMTP - Bug #24/#25) with a code the
// app generates, stores (signup_verification_codes, migration 0053), and
// emails itself via Gmail SMTP. `nodemailer` is a real new dependency here,
// explicitly named and authorized by the user rather than assumed.
//
// GMAIL_USER/GMAIL_APP_PASSWORD live only in .env.local/Vercel's env
// settings, same convention as RESEND_API_KEY (sendEmail.ts) - never
// committed. A Gmail App Password (not the account's real password) is
// generated at Google Account > Security > 2-Step Verification > App
// Passwords.
const CODE_TTL_MINUTES = 15;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateSignupCode(): string {
  // 6 digits, zero-padded - matches the shape of the code field/UI T132
  // originally built (maxLength={6}, pattern="[0-9]{6}").
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

export function codeExpiryFromNow(): string {
  return new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
}

function renderVerificationEmailHtml(code: string): string {
  return `<div style="font-family:Inter,Arial,sans-serif;color:#37352F;max-width:480px;margin:0 auto;">
    <h1 style="font-size:18px;">Confirm your Orium account</h1>
    <p style="color:#666;font-size:14px;">Enter this code to finish signing up. It expires in ${CODE_TTL_MINUTES} minutes.</p>
    <p style="font-size:32px;font-weight:600;letter-spacing:0.3em;text-align:center;margin:24px 0;">${escapeHtml(code)}</p>
    <p style="margin-top:16px;font-size:12px;color:#999;">
      If you didn't try to sign up for Orium, you can ignore this email.
    </p>
  </div>`;
}

// Returns an error string on failure, null on success - same convention
// sendDueTodayEmail (sendEmail.ts) already uses, so callers handle both the
// same way.
export async function sendSignupVerificationEmail(toEmail: string, code: string): Promise<{ error: string | null }> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { error: "GMAIL_USER/GMAIL_APP_PASSWORD are not set." };

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS on port 587, not implicit TLS
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: `Orium <${user}>`,
      to: toEmail,
      subject: "Your Orium confirmation code",
      html: renderVerificationEmailHtml(code),
    });
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send verification email." };
  }
}
