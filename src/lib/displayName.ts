// Greeting name rule (SPEC2 T23): profile name if set, otherwise the email's
// local part (before @). Never a blank or "undefined" greeting.
export function displayName(name: string | null | undefined, email: string | null | undefined): string {
  const trimmedName = name?.trim();
  if (trimmedName) return trimmedName;

  const trimmedEmail = email?.trim() ?? "";
  const atIndex = trimmedEmail.indexOf("@");
  return atIndex === -1 ? trimmedEmail : trimmedEmail.slice(0, atIndex);
}
