export type ID = string;

export interface PublicUser {
  id: ID;
  handle: string;
  displayName: string;
  bio: string;
  interests: string[];
  /** Index into the avatar colour pairs. */
  hue: number;
  joinedAt: string;
}

export interface Post {
  id: ID;
  authorId: ID;
  body: string;
  createdAt: string;
  /** Baseline reaction count from mock data; the viewer's own reaction is layered on top. */
  reactions: number;
  comments: number;
}

export interface FeedPost extends Post {
  author: PublicUser;
  reactedByMe: boolean;
  reactionTotal: number;
}

export type LearnType = 'article' | 'video' | 'path';
export interface LearnItem {
  id: ID;
  type: LearnType;
  title: string;
  summary: string;
  category: string;
  minutes: number;
  level: 'Starter' | 'Growing';
  body?: string[];
  steps?: { title: string; itemId?: ID }[];
}

export type OpportunityType = 'scholarship' | 'internship' | 'grant' | 'entry_level_job';
export interface Opportunity {
  id: ID;
  type: OpportunityType;
  title: string;
  organization: string;
  summary: string;
  category: string;
  location: string;
  deadline: string;
}

export interface Mentor {
  id: ID;
  name: string;
  headline: string;
  bio: string;
  expertise: string[];
  availability: string;
  hue: number;
}

export type RsvpResponse = 'yes' | 'maybe' | 'no';
export interface EventItem {
  id: ID;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  format: 'virtual' | 'in_person';
  where: string;
  going: number;
  myRsvp?: RsvpResponse;
}

export interface Conversation {
  id: ID;
  name: string;
  preview: string;
  time: string;
  unread: number;
  hue: number;
}

export interface AgeAttestation {
  method: 'self_attestation';
  status: 'attested';
  attestedAt: string;
}

export interface Account {
  id: ID;
  email: string;
  handle: string;
  displayName: string;
  bio: string;
  interests: string[];
  goals: string[];
  hue: number;
  onboarded: boolean;
  age: AgeAttestation;
  createdAt: string;
  isDemo?: boolean;
}

export type SimMode = 'normal' | 'slow' | 'error' | 'empty';
