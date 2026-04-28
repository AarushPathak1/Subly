import { requireEduVerified } from "@/lib/auth";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

interface MatchResult {
  listing_id: string;
  score: number;
  university: string | null;
  rent_cents: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
}

async function getMatches(userId: string, token: string): Promise<MatchResult[]> {
  try {
    const res = await fetch(`${GATEWAY}/api/matching/matches/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 404) return [];
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

function MatchCard({ match }: { match: MatchResult }) {
  const rent = match.rent_cents != null ? `$${(match.rent_cents / 100).toLocaleString()}/mo` : "Rent TBD";
  const beds = match.bedrooms ?? "–";
  const baths = match.bathrooms ?? "–";
  const score = Math.round(match.score * 100);
  const university = match.university ?? "Unknown";

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-3 hover:shadow-md transition">
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          {university}
        </span>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
          {score}% match
        </span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{rent}</p>
      <p className="text-sm text-gray-500">
        {beds} bed &middot; {baths} bath
      </p>
      <Link
        href={`/listings/${match.listing_id}`}
        className="mt-auto text-sm font-medium text-indigo-600 hover:underline"
      >
        View listing
      </Link>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireEduVerified();

  const { getToken } = auth();
  const token = await getToken();

  // Check if user has completed the vibe profile; if not, send them to onboarding
  const profileRes = await fetch(`${GATEWAY}/api/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (profileRes.status === 404) redirect("/onboarding");

  const matches = await getMatches(user.id, token!);

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between px-8 py-4 bg-white border-b">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Subly
        </Link>
        <div className="flex gap-4 items-center">
          <Link
            href="/listings/new"
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            Post a sublease
          </Link>
          <Link
            href="/onboarding"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Edit preferences
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Your top matches
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Based on your vibe, here are the listings most compatible with what
          you are looking for.
        </p>

        {matches.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <p className="text-gray-500 text-sm mb-4">
              No matches yet — listings are still being indexed.
            </p>
            <Link
              href="/listings/new"
              className="inline-block text-sm font-medium text-indigo-600 hover:underline"
            >
              Be the first to post a sublease
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {matches.map((m) => (
              <MatchCard key={m.listing_id} match={m} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
