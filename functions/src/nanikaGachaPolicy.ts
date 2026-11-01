import { NANIKA_HOLD_MS, NANIKA_TIERS, type NanikaTier } from "./nanikaGachaTypes";
export { matchesXAccountRow as nanikaXMatches } from "./common/normalize";

export function isNanikaTier(value: unknown): value is NanikaTier {
  return NANIKA_TIERS.some(tier => tier.id === value);
}

export function nanikaDecision(deadline: number, now: number, choice: "points" | "shipping") {
  return now >= deadline ? { choice: "points" as const, automatic: true } : { choice, automatic: false };
}

export function nanikaTerms(fee: number, exchangePoints: number) {
  return { fee, exchangePoints, holdHours: NANIKA_HOLD_MS / 3600000 };
}
