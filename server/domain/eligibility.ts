import { MIN_AGE, MAX_PLAUSIBLE_AGE } from '../../shared/constants';

export type EligibilityResult =
  | { eligible: true; age: number }
  | { eligible: false; reason: 'invalid_date' | 'too_young' };

/**
 * Computes eligibility from a full birth date. FREEVERSE is for adults aged 18 and above: there is no upper limit.
 * The day is used only here: callers store month and year and drop the day.
 * This is a self-declared date, not verified identity, and must always be described that way.
 */
export function checkEligibility(b: { month: number; day: number; year: number }, now: Date): EligibilityResult {
  const { month, day, year } = b;
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year) || month < 1 || month > 12 || day < 1 || year < 1900) return { eligible: false, reason: 'invalid_date' };
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return { eligible: false, reason: 'invalid_date' };
  if (dt.getTime() > now.getTime()) return { eligible: false, reason: 'invalid_date' };
  let age = now.getUTCFullYear() - year;
  const m = now.getUTCMonth() + 1;
  if (m < month || (m === month && now.getUTCDate() < day)) age -= 1;
  if (age < MIN_AGE) return { eligible: false, reason: 'too_young' };
  if (age > MAX_PLAUSIBLE_AGE) return { eligible: false, reason: 'invalid_date' };
  return { eligible: true, age };
}

export type AgeBand = '18–24' | '25–34' | '35–49' | '50+';
/** A coarse, privacy-preserving band from month+year only (when the exact day is unknown the lower bound is used). */
export function ageBand(birthMonth: number, birthYear: number, now: Date): AgeBand | null {
  const m = now.getUTCMonth() + 1;
  let age = now.getUTCFullYear() - birthYear;
  if (m <= birthMonth) age -= 1;
  if (age < MIN_AGE) return null;
  if (age <= 24) return '18–24';
  if (age <= 34) return '25–34';
  if (age <= 49) return '35–49';
  return '50+';
}
