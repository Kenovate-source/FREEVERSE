import type { Role } from '../../shared/constants';

// Authority is split on purpose: governance rank, operational duties, moderation duties and access to private personal
// content are different things. No role below grants blanket access to private messages, Nova conversations or journals.
export const PERMISSIONS = [
  'founder.console',
  'governance.view', 'governance.manage', 'governance.appoint', 'governance.remove', 'governance.propose',
  'roles.grant_moderator',
  'access_review.view', 'access_review.run',
  'audit.view', 'security.view',
  'proposals.view', 'proposals.decide',
  'ai.founder.use', 'ai.autonomy.manage', 'ai.council.view', 'ai.council.manage',
  'config.manage',
  'analytics.view', 'ops.dashboard.view', 'community.health.view',
  'moderation.queue.view', 'moderation.case.act', 'moderation.case.review_content', 'moderation.reveal_anonymous', 'moderation.user.suspend',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const moderator: Permission[] = ['moderation.queue.view', 'moderation.case.act', 'moderation.case.review_content', 'moderation.reveal_anonymous', 'moderation.user.suspend'];
const guardian: Permission[] = ['community.health.view', 'moderation.queue.view'];
const director: Permission[] = ['ops.dashboard.view', 'community.health.view', 'moderation.queue.view', 'analytics.view', 'governance.view'];
const highCouncil: Permission[] = [...director, 'ai.council.view', 'proposals.view'];
const council: Permission[] = [...highCouncil, 'governance.propose', 'access_review.view', 'audit.view', 'security.view'];
const founder: Permission[] = [
  ...council,
  'founder.console', 'governance.manage', 'governance.appoint', 'governance.remove', 'roles.grant_moderator', 'access_review.run',
  'proposals.decide', 'ai.founder.use', 'ai.autonomy.manage', 'ai.council.manage', 'config.manage',
  // The Founder may act as the final reviewer on a case (reason required, audited) but does not get anonymous-author reveal by default.
  'moderation.case.act', 'moderation.case.review_content',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  moderator,
  admin: ['ops.dashboard.view', 'analytics.view'],
  guardian,
  director,
  high_council: highCouncil,
  council,
  founder,
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) out.add(p);
  return out;
}
