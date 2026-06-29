/**
 * leaseSummary — computes the human-readable lease duration and total cost
 * line shown below the monthly rent on the listing detail page.
 *
 * Examples:
 *   { rent_cents: 120000, available_from: "2026-05-01", available_to: "2026-08-31" }
 *   → "4-month sublease · $4,800 total"
 *
 *   { rent_cents: 120000, available_from: "2026-05-01" }
 *   → "Open-ended · $1,200/mo"
 */
export function leaseSummary(l: {
  rent_cents: number;
  available_from: string;
  available_to?: string;
}): string {
  const monthly = l.rent_cents / 100;
  if (!l.available_to) return `Open-ended · $${monthly.toLocaleString()}/mo`;
  const from = new Date(l.available_from + "T00:00:00Z");
  const to   = new Date(l.available_to   + "T00:00:00Z");
  const days = Math.max(0, (to.getTime() - from.getTime()) / 86_400_000);
  const months = Math.max(1, Math.round(days / 30.4375));
  if (Number.isNaN(months)) return `Open-ended · $${monthly.toLocaleString()}/mo`;
  const total = monthly * months;
  return `${months}-month sublease · $${total.toLocaleString()} total`;
}
