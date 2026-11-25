/**
 * AUTH_USERS is a JSON object {"email": "password"}; values may also be bcrypt hashes ($2…).
 * Parsed once at boot; emails are lower-cased.
 */
export function parseAuthUsers(raw: string): Map<string, string> {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error('must be a JSON object like {"you@example.com":"password"}');
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('must be a JSON object like {"you@example.com":"password"}');
  }
  const users = new Map<string, string>();
  for (const [email, password] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof password !== 'string' || !password) throw new Error(`password for ${email} must be a non-empty string`);
    const key = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(key)) throw new Error(`"${email}" is not an email address`);
    users.set(key, password);
  }
  if (users.size === 0) throw new Error('must contain at least one user');
  return users;
}
