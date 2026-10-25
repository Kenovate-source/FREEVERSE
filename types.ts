export interface ProviderIdentity {
  provider: 'dev' | 'supabase';
  subject: string;
  email: string | null;
  emailVerified: boolean;
}
export interface ProviderSession { accessToken: string; refreshToken?: string; expiresAt?: string }

export interface AuthProvider {
  readonly kind: 'dev' | 'supabase';
  /** Whether this provider is real, managed authentication. The dev provider is not. */
  readonly managed: boolean;
  signUp(email: string, password: string, opts?: { redirectTo?: string }): Promise<{ identity: ProviderIdentity; session?: ProviderSession; needsEmailConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<{ identity: ProviderIdentity; session: ProviderSession }>;
  signOut(accessToken: string): Promise<void>;
  recover(email: string, opts?: { redirectTo?: string }): Promise<void>;
  updatePassword(accessToken: string, newPassword: string): Promise<void>;
  /** Returns the identity for a valid access token, or null. */
  verifyToken(accessToken: string): Promise<ProviderIdentity | null>;
  /** Re-checks credentials without creating a session; used for step-up. */
  verifyPassword(email: string, password: string): Promise<boolean>;
  deleteIdentity(subject: string): Promise<{ deleted: boolean; note?: string }>;
  describe(): { kind: string; managed: boolean; note: string };
}

export class AuthProviderError extends Error {
  constructor(public status: number, public code: 'invalid_credentials' | 'email_not_confirmed' | 'already_registered' | 'weak_password' | 'rate_limited' | 'provider_unavailable' | 'invalid_request' | 'not_supported', message: string) { super(message); }
}
