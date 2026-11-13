export const PROJECT_STATUSES = ['open', 'in_progress', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { open: 'Looking for people', in_progress: 'In progress', completed: 'Completed', archived: 'Archived' };
export type MyProjectState = 'owner' | 'member' | 'pending' | null;
export interface ProjectCard { id: string; universeId: string; title: string; summary: string; lookingFor: string | null; status: ProjectStatus; members: number; maxMembers: number; owner: { handle: string | null; displayName: string }; mine: MyProjectState; createdAt: string }
export interface ProjectDetail extends ProjectCard {
  details: string | null;
  team: { userId: string; handle: string | null; displayName: string; role: 'owner' | 'member' }[];
  /** Visible to the owner only. */
  requests: { userId: string; handle: string | null; displayName: string; message: string | null; at: string }[];
  updates: { id: string; body: string; at: string; author: { handle: string | null; displayName: string } }[];
  canModerate: boolean;
}
