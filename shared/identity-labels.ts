// "How I describe myself" labels: a broad, extensible vocabulary that sits ALONGSIDE the fifteen identity spaces.
// Identity is not authority: nothing here grants a permission or a role. Labels are self-declared and shown only to the audience the person picks.
// To add a category or label, add it to RAW below. Keys are stable slugs: never rename a label without keeping its old key.
import { slugify } from './interests';
import { normalizeLabel } from './label-screen';

export const LABEL_STAGES = ['current', 'aspiring', 'exploring'] as const;
export type LabelStage = (typeof LABEL_STAGES)[number];
export const LABEL_STAGE_TEXT: Record<LabelStage, { title: string; sentence: string; help: string }> = {
  current: { title: 'I am', sentence: 'I am', help: 'Who you are or what you do now.' },
  aspiring: { title: 'I’m becoming', sentence: 'I’m working towards being', help: 'What you hope to become. It can change.' },
  exploring: { title: 'I’m exploring', sentence: 'I’m exploring being', help: 'Trying something on to see if it fits. No commitment.' },
};
export const LABEL_LIMITS = { max: 24, labelMin: 2, labelMax: 40, noteMax: 200 } as const;

const RAW: Record<string, string[]> = {
  'Learning': ['Student', 'Self-taught learner', 'Lifelong learner', 'Graduate', 'Tutor', 'Teacher', 'Lecturer', 'Mature student', 'Bootcamp learner', 'Apprentice', 'Home-schooler', 'Scholar'],
  'Creative': ['Artist', 'Writer', 'Poet', 'Musician', 'Producer', 'Photographer', 'Filmmaker', 'Designer', 'Illustrator', 'Animator', 'Storyteller', 'Content creator', 'Dancer', 'Actor', 'Fashion designer', 'Craftsperson', 'Podcaster'],
  'Research and science': ['Researcher', 'Scientist', 'Analyst', 'Data scientist', 'Academic', 'Lab technician', 'Historian', 'Mathematician', 'Citizen scientist', 'Field researcher'],
  'Technology': ['Software developer', 'Engineer', 'Designer of products', 'Hacker (builder)', 'Open-source contributor', 'Cybersecurity professional', 'AI practitioner', 'Game developer', 'Hardware tinkerer', 'Tech lead'],
  'Business': ['Entrepreneur', 'Startup founder', 'Co-founder', 'Freelancer', 'Consultant', 'Investor', 'Small business owner', 'Product manager', 'Marketer', 'Salesperson', 'Operator', 'Social entrepreneur'],
  'Work and career': ['Professional', 'Job seeker', 'Career changer', 'Intern', 'Manager', 'Team lead', 'Remote worker', 'Returning to work', 'Trades person', 'Civil servant', 'Healthcare worker', 'Lawyer', 'Accountant'],
  'Community and care': ['Volunteer', 'Mentor', 'Mentee', 'Community organiser', 'Activist', 'Caregiver', 'Parent', 'Peer supporter', 'Youth worker', 'Faith community member', 'Neighbour'],
  'Play and sport': ['Gamer', 'Esports player', 'Athlete', 'Coach', 'Runner', 'Hobbyist', 'Collector', 'Board-game fan', 'Fan', 'Cosplayer', 'Fitness enthusiast'],
  'Ways of being': ['Explorer', 'Builder', 'Thinker', 'Maker', 'Helper', 'Connector', 'Storyteller of my community', 'Dreamer', 'Beginner', 'Expert', 'Late bloomer', 'Career-curious', 'Still figuring it out'],
  'Place and background': ['Diaspora member', 'First-generation graduate', 'Immigrant', 'Rural-raised', 'City dweller', 'Multilingual', 'Traveller', 'Expat'],
};

export interface LabelCategory { id: string; label: string }
export interface LabelItem { key: string; label: string; category: string }
export const LABEL_CATEGORIES: LabelCategory[] = Object.keys(RAW).map((l) => ({ id: slugify(l), label: l }));
export const LABEL_CATALOG: LabelItem[] = Object.entries(RAW).flatMap(([cat, items]) => items.map((label) => ({ key: slugify(label), label, category: slugify(cat) })));
export const labelByKey = (k: string): LabelItem | undefined => LABEL_CATALOG.find((x) => x.key === k);

const AUTHORITY = new Set(['admin', 'administrator', 'moderator', 'mod', 'council', 'high council', 'council member', 'guardian', 'director', 'staff', 'official', 'verified', 'verified member', 'trust and safety', 'support', 'support team', 'founder', 'the founder', 'owner', 'platform owner', 'platform admin', 'freeverse team', 'ai council']);
/**
 * Custom labels must describe a person, not claim platform authority or impersonate FREEVERSE.
 * Returns a plain-language reason, or null when the label is fine. (Abuse wording is screened separately with screenLabel.)
 */
export function screenIdentityClaim(label: string): string | null {
  const n = normalizeLabel(label).replace(/\s+/g, ' ').trim();
  if (/free\s?verse/.test(n.replace(/\s/g, '')) || AUTHORITY.has(n))
    return 'Labels describe who you are. They can’t claim a FREEVERSE role or speak for the platform, because roles are given by the platform, never chosen. You could try something like “startup founder” or “community organiser”.';
  return null;
}
