export function calculateMatchFee(initialRentCents: number): number {
  if (initialRentCents < 100000) return 2900;
  if (initialRentCents < 200000) return 4900;
  return 7900;
}
