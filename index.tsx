import { TermsPage, PrivacyPage, RulesPage } from './legal';
import type { ComponentType } from 'react';
import { Landing, Trust } from './landing';
import { SignIn, SignUp, Recover, ResetPassword, Eligibility } from './auth';
import { Onboarding } from './onboarding';
import { HomePage, CommunitiesPage, CommunityPage, PostPage, MemberPage, ExplorePage, SearchPage } from './social';
import { LearnPage, LearnItemPage, OpportunitiesPage, OpportunityPage, MentorsPage, EventsPage, EventPage } from './grow';
import { MessagesPage, ConversationPage, NotificationsPage, SavedPage } from './inbox';
import { NovaPage, NovaChatPage, JournalPage, GoalsPage, HabitsPage, CouncilPage, CouncilAgentPage } from './ai';
import { IdentitiesPage, SpacePage, ProfileEditPage } from './me';
import { SettingsPage } from './settings';
import { SoonPage, HelpPage } from './explore-more';
import { UniversesPage, UniversePage } from './universes';
import { FounderPage, GovernancePage, ModerationPage, ModerationCasePage } from './steward';

type PageProps = { params: Record<string, string>; query: URLSearchParams };
const w = (C: ComponentType<any>) => C as ComponentType<PageProps>;
export const PAGES: Record<string, ComponentType<PageProps>> = {
  landing: w(Landing), trust: w(Trust), terms: w(TermsPage), privacy: w(PrivacyPage), rules: w(RulesPage), signin: w(SignIn), signup: w(SignUp), recover: w(Recover), 'reset-password': w(ResetPassword), eligibility: w(Eligibility), onboarding: w(Onboarding),
  home: HomePage, explore: ExplorePage, search: SearchPage, communities: CommunitiesPage, community: CommunityPage, post: PostPage, member: MemberPage,
  messages: MessagesPage, conversation: ConversationPage, notifications: NotificationsPage, saved: SavedPage,
  learn: LearnPage, 'learn-item': LearnItemPage, opportunities: OpportunitiesPage, opportunity: OpportunityPage, mentors: MentorsPage, events: EventsPage, event: EventPage,
  nova: NovaPage, 'nova-chat': NovaChatPage, journal: JournalPage, goals: GoalsPage, habits: HabitsPage, council: CouncilPage, 'council-agent': CouncilAgentPage,
  identities: IdentitiesPage, space: SpacePage, 'profile-edit': ProfileEditPage, settings: SettingsPage, 'settings-section': SettingsPage,
  universes: UniversesPage, universe: UniversePage, 'universe-space': UniversePage, soon: SoonPage, help: HelpPage,
  founder: FounderPage, 'founder-section': FounderPage, governance: GovernancePage, moderation: ModerationPage, 'moderation-case': ModerationCasePage,
};
