const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

export async function fetchListings() {
  const res = await fetch(`${GATEWAY}/api/listings/listings`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch listings");
  return res.json();
}

export async function searchListings(query: string, university?: string) {
  const res = await fetch(`${GATEWAY}/api/matching/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, university, top_k: 10 }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}
