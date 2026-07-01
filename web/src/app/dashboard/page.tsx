import { getSessionUser } from "@/lib/auth";
import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { NonEduGate } from "@/components/NonEduGate";
import { fetchSavedListingIds } from "@/lib/actions";
import { MatchCard, type MatchResult } from "@/components/MatchCard";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

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


function EmptyState() {
  return (
    <div className="col-span-3 flex flex-col items-center justify-center bg-white border border-slate-200 border-dashed rounded-2xl py-20 px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M16 4L28 11V27H4V11L16 4Z" fill="#e0e7ff" stroke="#4f46e5" strokeWidth="1.5"/>
          <rect x="12" y="19" width="8" height="8" rx="1.5" fill="#4f46e5" fillOpacity="0.3"/>
          <circle cx="16" cy="15" r="2.5" fill="#4f46e5" fillOpacity="0.5"/>
        </svg>
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-2">No matches yet</h3>
      <p className="text-sm text-slate-500 mb-6 max-w-xs leading-relaxed">
        Listings are still being indexed by our AI. Check back shortly, or be the first to post a sublease.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/listings/new"
          className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
        >
          Post a sublease
        </Link>
        <Link
          href="/onboarding"
          className="px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition"
        >
          Update preferences
        </Link>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const { getToken } = await auth();
  const [clerkUser, token] = await Promise.all([currentUser(), getToken()]);

  const primaryEmail = clerkUser?.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress ?? null;

  let user = await getSessionUser();

  // Auto-verify: if not yet verified, try using their Clerk email directly
  if ((!user || !user.edu_verified) && primaryEmail && token) {
    const verifyRes = await fetch(`${GATEWAY}/api/auth/verify-edu`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: primaryEmail }),
      cache: "no-store",
    });
    if (verifyRes.ok) {
      const data = await verifyRes.json();
      if (data.edu_verified) user = await getSessionUser();
    }
  }

  if (!user || !user.edu_verified) {
    return <NonEduGate email={primaryEmail} />;
  }

  const profileRes = await fetch(`${GATEWAY}/api/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (profileRes.status === 404) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppNav active="dashboard" />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center">
          <div className="bg-white border border-violet-100 rounded-2xl p-10 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="10" stroke="#7c3aed" strokeWidth="1.5" fill="#ede9fe"/>
                <path d="M14 8v6l4 2" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Set up your preferences</h2>
            <p className="text-sm text-slate-500 mb-7 leading-relaxed">
              Tell us your vibe so our AI can find subleases that actually match what you're looking for.
            </p>
            <Link
              href="/onboarding"
              className="inline-block px-6 py-3 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition"
            >
              Set up my preferences
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const matches = await getMatches(user.id, token!);
  const savedIds = await fetchSavedListingIds();
  const topScore = matches.length > 0 ? Math.round(matches[0].score * 100) : null;
  const safeMatches = matches.filter((m) => m.scam_score <= 0.7).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav active="dashboard" />

      {/* Hero strip */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <h1 className="text-2xl font-extrabold text-white mb-1">Your top matches</h1>
          <p className="text-indigo-200 text-sm">
            Ranked by AI similarity to your vibe profile —{" "}
            <Link href="/onboarding" className="underline hover:text-white transition">
              update preferences
            </Link>
          </p>

          {matches.length > 0 && (
            <div className="flex gap-6 mt-5">
              <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3">
                <p className="text-xs text-indigo-200 font-medium">Listings found</p>
                <p className="text-2xl font-extrabold text-white">{matches.length}</p>
              </div>
              {topScore !== null && (
                <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3">
                  <p className="text-xs text-indigo-200 font-medium">Top match score</p>
                  <p className="text-2xl font-extrabold text-white">{topScore}%</p>
                </div>
              )}
              <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3">
                <p className="text-xs text-indigo-200 font-medium">Trusted listings</p>
                <p className="text-2xl font-extrabold text-white">{safeMatches}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Listings grid */}
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {matches.length === 0 ? (
            <EmptyState />
          ) : (
            matches.map((m) => <MatchCard key={m.listing_id} match={m} isSaved={savedIds.has(m.listing_id)} />)
          )}
        </div>

        {matches.length > 0 && (
          <div className="mt-8 text-center">
            <p className="text-sm text-slate-500 mb-4">
              Not seeing what you&apos;re looking for?{" "}
              <Link href="/onboarding" className="text-indigo-600 hover:underline font-medium">
                Refine your preferences
              </Link>{" "}
              or{" "}
              <Link href="/listings/new" className="text-indigo-600 hover:underline font-medium">
                post your own sublease.
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
