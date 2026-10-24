export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): string | undefined {
  const v = email.trim();
  if (!v) return 'Enter your email address.';
  if (!EMAIL.test(v)) return 'That email address doesn’t look right.';
  return undefined;
}

export function validateDisplayName(name: string): string | undefined {
  const v = name.trim();
  if (v.length < 2) return 'Display name must be at least 2 characters.';
  if (v.length > 40) return 'Display name must be 40 characters or fewer.';
  return undefined;
}

/** Mock-only rule. The password is checked for shape and then discarded; it is never stored. */
export function validatePassword(pw: string): string | undefined {
  if (pw.length < 8) return 'Use at least 8 characters.';
  return undefined;
}

export const POST_MAX = 500;
export function validatePost(body: string): string | undefined {
  const v = body.trim();
  if (!v) return 'Write something before posting.';
  if (v.length > POST_MAX) return `Posts can be up to ${POST_MAX} characters.`;
  return undefined;
}

export function slugHandle(displayName: string): string {
  const base = displayName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24);
  return base || 'member';
}
