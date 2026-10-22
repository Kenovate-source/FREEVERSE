import { MAX_AGE, MIN_AGE } from '../../shared/constants';

export type EligibilityResult =
  | { eligible: true; age: number }
  | { eligible: false; reason: 'invalid_date' | 'too_young' | 'too_old' };

/**
 * Computes eligibility from a full birth date. The day is used only here: callers store month and year and drop the day.
 * This is a self-declared date, not verified identity, and must always be described that way.
 */
export function checkEligibility(b: { month: number; day: number; year: number }, now: Date, opts: { skipMax?: boolean } = {}): EligibilityResult {
  const { month, day, year } = b;
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year) || month < 1 || month > 12 || day < 1 || year < 1900) return { eligible: false, reason: 'invalid_date' };
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return { eligible: false, reason: 'invalid_date' };
  if (dt.getTime() > now.getTime()) return { eligible: false, reason: 'invalid_date' };
  let age = now.getUTCFullYear() - year;
  const m = now.getUTCMonth() + 1;
  if (m < month || (m === month && now.getUTCDate() < day)) age -= 1;
  if (age < MIN_AGE) return { eligible: false, reason: 'too_young' };
  if (age > MAX_AGE && !opts.skipMax) return { eligible: false, reason: 'too_old' };
  return { eligible: true, age };
}

/** A coarse, privacy-preserving band from month+year only (when the exact day is unknown the lower bound is used). */
export function ageBand(birthMonth: number, birthYear: number, now: Date): '18–20' | '21–24' | '25+' | null {
  const m = now.getUTCMonth() + 1;
  let age = now.getUTCFullYear() - birthYear;
  if (m <= birthMonth) age -= 1;
  if (age < MIN_AGE) return null;
  if (age <= 20) return '18–20';
  if (age <= MAX_AGE) return '21–24';
  return '25+';
}
