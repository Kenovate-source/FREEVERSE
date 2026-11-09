// How each identity space is arranged. The data (tools, milestones, entries, destinations) comes from the identity definitions;
// this file only says which working environment presents it and which sections that identity actually has.
import type { Archetype } from './constants';

export type Layout = 'studio' | 'pathway' | 'lanes' | 'console' | 'stages' | 'arena' | 'board' | 'commons';
export type ViewId = 'workspace' | 'tools' | 'entries' | 'milestones' | 'go';
export interface SpaceDesign { layout: Layout; /** The identity's own sections, in order. Not every identity has every section. */ views: { id: ViewId; label: string }[]; stageLabel: string; objectNoun: string }

const V = (...p: [ViewId, string][]) => p.map(([id, label]) => ({ id, label }));
export const SPACE_DESIGN: Record<Archetype, SpaceDesign> = {
  student: { layout: 'pathway', stageLabel: 'Your study path', objectNoun: 'waypoint', views: V(['workspace', 'Study path'], ['tools', 'Tools'], ['entries', 'Coursework'], ['milestones', 'Milestones'], ['go', 'Learn & apply']) },
  graduate: { layout: 'pathway', stageLabel: 'Your career pathway', objectNoun: 'waypoint', views: V(['workspace', 'Pathway'], ['tools', 'Tools'], ['entries', 'Portfolio & credentials'], ['milestones', 'Milestones'], ['go', 'Opportunities']) },
  researcher: { layout: 'console', stageLabel: 'Research desk', objectNoun: 'command', views: V(['workspace', 'Desk'], ['tools', 'Tools'], ['entries', 'Outputs'], ['milestones', 'Milestones'], ['go', 'Reading & funding']) },
  creator: { layout: 'studio', stageLabel: 'Your studio', objectNoun: 'studio object', views: V(['workspace', 'Studio'], ['tools', 'Tools'], ['entries', 'Showcase & projects'], ['milestones', 'Milestones'], ['go', 'Challenges & community']) },
  gamer: { layout: 'arena', stageLabel: 'Your arena', objectNoun: 'tile', views: V(['workspace', 'Arena'], ['tools', 'Loadout'], ['entries', 'Highlights'], ['milestones', 'Achievements'], ['go', 'Play & meet']) },
  professional: { layout: 'lanes', stageLabel: 'Your working lanes', objectNoun: 'card', views: V(['workspace', 'Lanes'], ['tools', 'Tools'], ['entries', 'Experience & skills'], ['milestones', 'Milestones'], ['go', 'Network & grow']) },
  entrepreneur: { layout: 'stages', stageLabel: 'Your venture path', objectNoun: 'stage', views: V(['workspace', 'Venture path'], ['tools', 'Tools'], ['entries', 'Ventures'], ['milestones', 'Milestones'], ['go', 'Funding & mentors']) },
  developer: { layout: 'console', stageLabel: 'Workbench', objectNoun: 'command', views: V(['workspace', 'Workbench'], ['tools', 'Tools'], ['entries', 'Projects & contributions'], ['milestones', 'Milestones'], ['go', 'Learn & hire']) },
  teacher: { layout: 'board', stageLabel: 'Your board', objectNoun: 'note', views: V(['workspace', 'Board'], ['tools', 'Tools'], ['entries', 'Resources & credentials'], ['milestones', 'Milestones'], ['go', 'Events & communities']) },
  mentor: { layout: 'board', stageLabel: 'Your mentoring board', objectNoun: 'note', views: V(['workspace', 'Board'], ['tools', 'Tools'], ['entries', 'Mentoring record'], ['milestones', 'Milestones'], ['go', 'Directory & events']) },
  employer: { layout: 'lanes', stageLabel: 'Your hiring lanes', objectNoun: 'card', views: V(['workspace', 'Lanes'], ['tools', 'Tools'], ['entries', 'About us'], ['go', 'Events & communities']) },
  investor: { layout: 'stages', stageLabel: 'Your portfolio path', objectNoun: 'stage', views: V(['workspace', 'Portfolio path'], ['tools', 'Tools'], ['entries', 'Experience'], ['go', 'Events & communities']) },
  organization: { layout: 'commons', stageLabel: 'Your organisation hub', objectNoun: 'node', views: V(['workspace', 'Hub'], ['tools', 'Tools'], ['entries', 'Projects & achievements'], ['milestones', 'Milestones'], ['go', 'Programmes & events']) },
  volunteer: { layout: 'commons', stageLabel: 'Your impact hub', objectNoun: 'node', views: V(['workspace', 'Impact hub'], ['tools', 'Tools'], ['entries', 'Contributions'], ['milestones', 'Milestones'], ['go', 'Opportunities & events']) },
  community_leader: { layout: 'commons', stageLabel: 'Your gathering', objectNoun: 'node', views: V(['workspace', 'Gathering'], ['tools', 'Tools'], ['entries', 'Contributions'], ['milestones', 'Milestones'], ['go', 'Communities & learning']) },
};
