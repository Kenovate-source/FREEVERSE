import type { ModuleDef } from './types';
import { authModule } from './auth';
import { profilesModule } from './profiles';
import { privacyModule } from './privacy';
import { mediaModule } from './media';
import { socialModule } from './social';
import { communitiesModule } from './communities';
import { postsModule } from './posts';
import { savesModule } from './saves';
import { notificationsModule } from './notifications';
import { messagesModule } from './messages';
import { reportsModule } from './reports';
import { moderationModule } from './moderation';
import { accountModule } from './account';
import { novaModule } from './nova';
import { councilModule } from './council';
import { personalToolsModule } from './personal-tools';
import { governanceModule } from './governance';
import { founderModule } from './founder';
import { founderAiModule } from './founder-ai';
import { learnModule } from './learn';
import { opportunitiesModule } from './opportunities';
import { eventsModule } from './events';
import { exploreModule } from './explore';
import { searchModule } from './search';
import { universesModule } from './universes';
import { identitiesModule } from './identities';
import { onboardingModule } from './onboarding';
import { homeModule } from './home';
import { spacesModule } from './spaces';
import { universeSpacesModule } from './universe-spaces';
import { demoSeedModule } from './demo-seed';

/** Every HTTP module, in registration order. Add new modules here. */
export const modules: ModuleDef[] = [
  authModule,
  profilesModule,
  privacyModule,
  mediaModule,
  socialModule,
  communitiesModule,
  postsModule,
  savesModule,
  notificationsModule,
  messagesModule,
  reportsModule,
  moderationModule,
  accountModule,
  novaModule,
  councilModule,
  personalToolsModule,
  governanceModule,
  founderModule,
  founderAiModule,
  learnModule,
  opportunitiesModule,
  eventsModule,
  exploreModule,
  searchModule,
  universesModule,
  identitiesModule,
  onboardingModule,
  homeModule,
  spacesModule,
  universeSpacesModule,
  demoSeedModule,
];
