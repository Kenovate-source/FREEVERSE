// Plain arithmetic for the FreeFinance calculators. Nothing here is saved or sent anywhere; results are illustrations, not advice.

export interface BudgetLine { name: string; amount: number }
export interface BudgetResult { total: number; remaining: number; shares: { name: string; amount: number; pct: number }[]; overspent: boolean }

export function budget(income: number, lines: BudgetLine[]): BudgetResult {
  const clean = lines.filter((l) => Number.isFinite(l.amount) && l.amount > 0);
  const total = round2(clean.reduce((a, l) => a + l.amount, 0));
  const inc = Number.isFinite(income) && income > 0 ? income : 0;
  const base = inc || total || 1;
  return { total, remaining: round2(inc - total), shares: clean.map((l) => ({ name: l.name || 'Unnamed', amount: l.amount, pct: round1((l.amount / base) * 100) })), overspent: inc > 0 && total > inc };
}

export interface GoalResult { monthsNeeded: number | null; monthlyNeeded: number | null; reachable: boolean; remaining: number }
/** Either how long a monthly saving takes, or what monthly amount reaches the target by a date. No interest assumed. */
export function savingsGoal(target: number, saved: number, monthly: number | null, months: number | null): GoalResult {
  const remaining = Math.max(0, round2(target - (saved || 0)));
  if (remaining === 0) return { monthsNeeded: 0, monthlyNeeded: 0, reachable: true, remaining };
  const monthsNeeded = monthly && monthly > 0 ? Math.ceil(remaining / monthly) : null;
  const monthlyNeeded = months && months > 0 ? round2(remaining / months) : null;
  return { monthsNeeded, monthlyNeeded, reachable: monthsNeeded !== null || monthlyNeeded !== null, remaining };
}

export interface GrowthRow { year: number; balance: number; contributed: number; growth: number }
/** Compound growth with monthly compounding and a fixed monthly contribution. An illustration with a made-up constant rate, not a forecast. */
export function compoundGrowth(principal: number, monthly: number, annualPct: number, years: number): GrowthRow[] {
  const y = Math.max(0, Math.min(60, Math.floor(years))); const r = Math.max(-50, Math.min(100, annualPct)) / 100 / 12;
  let bal = Math.max(0, principal || 0); let put = bal; const rows: GrowthRow[] = [];
  for (let m = 1; m <= y * 12; m++) {
    bal = bal * (1 + r) + Math.max(0, monthly || 0); put += Math.max(0, monthly || 0);
    if (m % 12 === 0) rows.push({ year: m / 12, balance: round2(bal), contributed: round2(put), growth: round2(bal - put) });
  }
  return rows;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const num = (v: string): number => { const n = Number(v.replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : NaN; };
