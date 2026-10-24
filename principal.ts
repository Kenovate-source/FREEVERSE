import type { Db } from '../db';
import type { Role } from '../../shared/constants';
import { type Permission, permissionsFor } from './permissions';

export type UserStatus = 'pending_eligibility' | 'active' | 'ineligible' | 'suspended' | 'deleted';

export interface Principal {
  userId: string;
  status: UserStatus;
  handle: string | null;
  displayName: string | null;
  email: string | null;
  roles: Role[];
  permissions: Set<Permission>;
  /** Governance level of the highest seat held (1,3,7,12,24) or null. */
  seatLevel: number | null;
  onboardingCompleted: boolean;
}

const LEVEL_BY_ROLE: Partial<Record<Role, number>> = { founder: 1, council: 3, high_council: 7, director: 12, guardian: 24 };

export async function loadPrincipal(db: Db, userId: string): Promise<Principal | null> {
  const u = await db.get<{ id: string; status: UserStatus; handle: string | null; display_name: string | null; onboarding_completed_at: string | null }>(
    'SELECT id, status, handle, display_name, onboarding_completed_at FROM users WHERE id = $1', [userId]);
  if (!u) return null;
  const roles = (await db.query<{ role: Role }>('SELECT role FROM role_grants WHERE user_id = $1 AND revoked_at IS NULL', [userId])).map((r) => r.role);
  const email = (await db.get<{ email: string | null }>('SELECT email FROM auth_identities WHERE user_id = $1 ORDER BY created_at LIMIT 1', [userId]))?.email ?? null;
  const levels = roles.map((r) => LEVEL_BY_ROLE[r]).filter((x): x is number => x !== undefined);
  return {
    userId: u.id, status: u.status, handle: u.handle, displayName: u.display_name, email, roles,
    permissions: u.status === 'active' ? permissionsFor(roles) : new Set(),
    seatLevel: levels.length ? Math.min(...levels) : null,
    onboardingCompleted: !!u.onboarding_completed_at,
  };
}

export const can = (p: Principal | null | undefined, perm: Permission): boolean => !!p && p.permissions.has(perm);
