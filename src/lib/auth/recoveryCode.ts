import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// T269 (SPEC.md): a username-only account has no email, so there's no
// email-link password reset (requestPasswordReset, auth/actions.ts) to fall
// back on. Shown exactly once, right after signup - the user pastes it back
// in later to prove ownership and set a new password
// (resetPasswordWithRecoveryCode). Never stored in plaintext, only a salted
// hash (below) - same reasoning a real password never is.

// Excludes visually ambiguous characters (0/O, 1/I/L) so a handwritten copy
// is easier to read back correctly.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const GROUP_COUNT = 4;
const GROUP_LENGTH = 5;
const SCRYPT_KEY_LENGTH = 64;

// Shared between auth/actions.ts (sets it right after generating a code) and
// the /save-recovery-code page (reads it once, server-side, to render the
// code) - HttpOnly so client JS can never read it, short-lived so it can't
// linger as a stale secret in the browser's cookie jar.
export const RECOVERY_CODE_COOKIE = "orium_recovery_code_reveal";

export function generateRecoveryCode(): string {
  const totalChars = GROUP_COUNT * GROUP_LENGTH;
  const bytes = randomBytes(totalChars);
  let raw = "";
  for (let i = 0; i < totalChars; i++) {
    raw += ALPHABET[bytes[i] % ALPHABET.length];
  }
  const groups: string[] = [];
  for (let i = 0; i < GROUP_COUNT; i++) {
    groups.push(raw.slice(i * GROUP_LENGTH, (i + 1) * GROUP_LENGTH));
  }
  return groups.join("-");
}

// Case/whitespace/dash-insensitive - a user copying the code back in
// shouldn't be tripped up by how they typed the separators.
function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalizeCode(code), salt, SCRYPT_KEY_LENGTH).toString("hex");
  return { hash, salt };
}

// Timing-safe comparison, same reasoning any credential check needs -
// string equality (`===`) leaks how many leading characters matched via
// response time.
export function verifyRecoveryCode(code: string, salt: string, hash: string): boolean {
  const candidate = scryptSync(normalizeCode(code), salt, SCRYPT_KEY_LENGTH);
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
