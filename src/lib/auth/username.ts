// T269 (SPEC.md): Supabase Auth has no native "username only" identity, so a
// username-only account uses a synthetic email as its real Supabase login
// identifier - never actually emailed to, never shown to the user, who only
// ever sees/enters their username.
const SYNTHETIC_EMAIL_DOMAIN = "users.orium.internal";

// 3-20 chars, lowercase letters/digits/underscore, must start with a letter -
// keeps the synthetic email a valid-looking address and avoids anything that
// would need URL/HTML escaping anywhere it's displayed.
const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function usernameToSyntheticEmail(username: string): string {
  return `${username}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function isSyntheticEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
}
