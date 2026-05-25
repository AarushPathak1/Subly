import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

interface MatchResult {
  listing_id: string;
  score: number;
  university: string | null;
  rent_cents: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  scam_score: number;
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

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? "bg-emerald-100 text-emerald-700" :
    pct >= 60 ? "bg-indigo-100 text-indigo-700" :
    "bg-slate-100 text-slate-600";
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${color}`}>
      {pct}% match
    </span>
  );
}

function MatchCard({ match }: { match: MatchResult }) {
  const rent = match.rent_cents != null
    ? `$${(match.rent_cents / 100).toLocaleString()}/mo`
    : "Rent TBD";
  const beds = match.bedrooms ?? "–";
  const baths = match.bathrooms ?? "–";
  const university = match.university ?? "Unknown University";
  const isHighRisk = match.scam_score > 0.7;
  const riskColor = match.scam_score > 0.7 ? "text-red-500" : match.scam_score > 0.4 ? "text-amber-500" : "text-emerald-500";
  const trustLabel = match.scam_score > 0.7 ? "High Risk" : match.scam_score > 0.4 ? "Review" : "Trusted";

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden flex flex-col hover:shadow-lg transition group ${
      isHighRisk ? "border-red-200" : "border-slate-200"
    }`}>
      {/* Image placeholder with gradient */}
      <div className={`h-40 relative overflow-hidden ${isHighRisk ? "bg-gradient-to-br from-red-900 to-red-950" : "bg-gradient-to-br from-indigo-900 to-slate-900"}`}>
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-400 via-transparent to-transparent" />
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
          <span className="text-xs font-bold text-white/90 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full">
            {university}
          </span>
          <ScoreBadge score={match.score} />
        </div>
        <div className="absolute bottom-3 left-3">
          <p className="text-2xl font-extrabold text-white">{rent}</p>
          <p className="text-xs text-white/70 mt-0.5">{beds} bed · {baths} bath</p>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {isHighRisk && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span className="text-xs font-semibold text-red-600">High Risk — proceed with caution</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: match.scam_score > 0.7 ? '#ef4444' : match.scam_score > 0.4 ? '#f59e0b' : '#10b981' }} />
            <span className={`text-xs font-semibold ${riskColor}`}>{trustLabel}</span>
          </div>
          <Link
            href={`/listings/${match.listing_id}`}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition group-hover:underline"
          >
            View listing →
          </Link>
        </div>
      </div>
    </div>
  );
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
  const user = await getSessionUser();
  const { getToken } = auth();
  const token = await getToken();

  // Unverified users see the dashboard with a verification banner instead of a redirect loop
  // Show verification prompt for any signed-in user who isn't fully verified yet
  // (covers both: user not in DB at all, or in DB but edu_verified=false)
  if (!user || !user.edu_verified) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppNav active="dashboard" />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center">
          <div className="bg-white border border-indigo-100 rounded-2xl p-10 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 3L4 7v7c0 5.5 4.3 10.7 10 12 5.7-1.3 10-6.5 10-12V7L14 3z" fill="#e0e7ff" stroke="#4f46e5" strokeWidth="1.5"/>
                <path d="M9 14l3.5 3.5 6.5-6.5" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Verify your .edu email to continue</h2>
            <p className="text-sm text-slate-500 mb-7 leading-relaxed">
              Subly is only open to verified university students. Verify your email to unlock matches and listings.
            </p>
            <Link
              href="/verify"
              className="inline-block px-6 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
            >
              Verify my .edu email
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const profileRes = await fetch(`${GATEWAY}/api/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (profileRes.status === 404) redirect("/onboarding");

  const matches = await getMatches(user.id, token!);
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
            matches.map((m) => <MatchCard key={m.listing_id} match={m} />)
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
