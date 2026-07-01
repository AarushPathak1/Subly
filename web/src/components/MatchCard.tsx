"use client";

import Link from "next/link";
import { SaveButton } from "@/components/SaveButton";
import { leaseSummary } from "@/lib/leaseSummary";

export interface MatchResult {
  listing_id: string;
  score: number;
  university: string | null;
  rent_cents: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  scam_score: number;
  title: string | null;
  address: string | null;
  image_url: string | null;
  available_from: string | null;
  available_to: string | null;
}

function formatAvailableFrom(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const currentYear = new Date().getFullYear();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === currentYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return `Available ${d.toLocaleDateString("en-US", opts)}`;
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? "bg-emerald-100 text-emerald-700" :
    pct >= 60 ? "bg-indigo-100 text-indigo-700" :
    "bg-slate-100 text-slate-600";
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${color}`}>
      {pct}% match
    </span>
  );
}

export function MatchCard({ match, isSaved }: { match: MatchResult; isSaved: boolean }) {
  const rent = match.rent_cents != null
    ? `$${(match.rent_cents / 100).toLocaleString()}/mo`
    : "Rent TBD";
  const beds = match.bedrooms ?? "–";
  const baths = match.bathrooms ?? "–";
  const university = match.university ?? "Unknown University";
  const title = match.title ?? "Sublease listing";
  const subtitle = match.address || university;
  const availableLabel = formatAvailableFrom(match.available_from);
  const lease = match.rent_cents != null && match.available_from != null
    ? leaseSummary({ rent_cents: match.rent_cents, available_from: match.available_from, available_to: match.available_to ?? undefined })
    : null;
  const isHighRisk = match.scam_score > 0.7;
  const riskColor = match.scam_score > 0.7 ? "text-red-500" : match.scam_score > 0.4 ? "text-amber-500" : "text-emerald-500";
  const trustLabel = match.scam_score > 0.7 ? "High Risk" : match.scam_score > 0.4 ? "Review" : "Trusted";

  return (
    <Link href={`/listings/${match.listing_id}`} className={`bg-white border rounded-2xl overflow-hidden flex flex-col hover:shadow-lg transition group ${
      isHighRisk ? "border-red-200" : "border-slate-200"
    }`}>
      {/* Image or gradient placeholder */}
      {match.image_url ? (
        <div className="relative h-40 overflow-hidden bg-slate-100">
          <img
            src={match.image_url}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
          <div className="absolute top-3 left-3">
            <ScoreBadge score={match.score} />
          </div>
          <SaveButton listingId={match.listing_id} initialSaved={isSaved} variant="card" />
        </div>
      ) : (
        <div className={`h-40 relative overflow-hidden ${isHighRisk ? "bg-gradient-to-br from-red-900 to-red-950" : "bg-gradient-to-br from-indigo-900 to-slate-900"}`}>
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-400 via-transparent to-transparent" />
          <div className="absolute top-3 left-3 right-11 flex items-start justify-between">
            <span className="text-xs font-bold text-white/90 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full">
              {university}
            </span>
            <ScoreBadge score={match.score} />
          </div>
          <SaveButton listingId={match.listing_id} initialSaved={isSaved} variant="card" />
        </div>
      )}

      {/* Card body */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-indigo-700 transition">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1C4.34 1 3 2.34 3 4c0 2.25 3 6 3 6s3-3.75 3-6c0-1.66-1.34-3-3-3z" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="6" cy="4" r="1.2" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            {subtitle}
          </p>
        )}

        <div className="flex items-center justify-between mt-1">
          <div>
            <p className="text-base font-extrabold text-slate-900">{rent}</p>
            <p className="text-xs text-slate-400">{beds} bed · {baths} bath</p>
            {lease && (
              <p className="text-xs font-semibold text-indigo-600 mt-0.5">{lease}</p>
            )}
            {availableLabel && (
              <p className="text-xs text-slate-500 mt-0.5">{availableLabel}</p>
            )}
          </div>
        </div>

        {isHighRisk && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span className="text-xs font-semibold text-red-600">High Risk — proceed with caution</span>
          </div>
        )}

        <div className="flex items-center mt-auto pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: match.scam_score > 0.7 ? '#ef4444' : match.scam_score > 0.4 ? '#f59e0b' : '#10b981' }} />
            <span className={`text-xs font-semibold ${riskColor}`}>{trustLabel}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
