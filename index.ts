import { TERMS_MD } from './terms';
import { PRIVACY_MD } from './privacy';
import { RULES_MD } from './rules';
import { LEGAL_VERSION } from '../constants';

export type LegalDocId = 'terms' | 'privacy' | 'community_rules';
export const LEGAL_DOCS: Record<LegalDocId, { title: string; path: string; md: string }> = {
  terms: { title: 'Terms of Service', path: '/terms', md: TERMS_MD },
  privacy: { title: 'Privacy Policy', path: '/privacy', md: PRIVACY_MD },
  community_rules: { title: 'Community rules', path: '/rules', md: RULES_MD },
};
export const LEGAL_DOC_IDS = Object.keys(LEGAL_DOCS) as LegalDocId[];
/** Count of unresolved [[PLACEHOLDER…]] markers in one document. */
export const placeholderCount = (id: LegalDocId): number => (LEGAL_DOCS[id].md.match(/\[\[PLACEHOLDER/g) ?? []).length;
export { LEGAL_VERSION };
