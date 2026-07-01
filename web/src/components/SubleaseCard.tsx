"use client";

import Link from "next/link";
import { SaveButton } from "@/components/SaveButton";
import { leaseSummary } from "@/lib/leaseSummary";

export interface CardListing {
  id: string;
  title: string;
  university?: string | null;
  rent_cents: number;
  available_from: string;
  available_to?: string | null;
  bedrooms: number;
  bathrooms: number;
  image_url?: string | null;
  scam_score: number;
  score?: number | null;
}

function formatAvailableFrom(iso: string | null | undefined): string | null {
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

export function SubleaseCard({ listing, isSaved }: { listing: CardListing; isSaved: boolean }) {
  const rent = `$${(listing.rent_cents / 100).toLocaleString()}/mo`;
  const lease = listing.available_to
    ? leaseSummary({
        rent_cents: listing.rent_cents,
        available_from: listing.available_from,
        available_to: listing.available_to,
      })
    : null;
  const availableLabel = formatAvailableFrom(listing.available_from);
  const isHighRisk = listing.scam_score > 0.7;
  const riskColor = listing.scam_score > 0.7 ? "text-red-500" : listing.scam_score > 0.4 ? "text-amber-500" : "text-emerald-500";
  const trustLabel = listing.scam_score > 0.7 ? "High Risk" : listing.scam_score > 0.4 ? "Review" : "Trusted";
  const showScore = listing.score != null;

  return (
    <Link
      href={`/listings/${listing.id}`}
      className={`group bg-white rounded-2xl border overflow-hidden hover:shadow-lg transition flex flex-col ${isHighRisk ? "border-red-200" : "border-slate-200"}`}
    >
      {listing.image_url ? (
        <div className="relative h-44 overflow-hidden bg-slate-100">
          <img
            src={listing.image_url}
            alt={listing.title}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
          {showScore && (
            <div className="absolute top-3 left-3">
              <ScoreBadge score={listing.score!} />
            </div>
          )}
          <SaveButton listingId={listing.id} initialSaved={isSaved} variant="card" />
        </div>
      ) : (
        <div className={`relative h-44 flex items-end p-4 ${isHighRisk ? "bg-gradient-to-br from-red-900 to-red-950" : "bg-gradient-to-br from-indigo-900 to-slate-900"}`}>
          {showScore && (
            <div className="absolute top-3 left-3">
              <ScoreBadge score={listing.score!} />
            </div>
          )}
          <SaveButton listingId={listing.id} initialSaved={isSaved} variant="card" />
          {listing.university && (
            <span className="text-xs font-bold text-white/80 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full">
              {listing.university}
            </span>
          )}
        </div>
      )}

      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-indigo-700 transition">
          {listing.title}
        </h3>

        {listing.university && (
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1C4.34 1 3 2.34 3 4c0 2.25 3 6 3 6s3-3.75 3-6c0-1.66-1.34-3-3-3z" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="6" cy="4" r="1.2" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            {listing.university}
          </p>
        )}

        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-base font-extrabold text-slate-900">{rent}</p>
            <p className="text-xs text-slate-400">{listing.bedrooms}bd · {listing.bathrooms}ba</p>
            {lease && <p className="text-xs text-indigo-600 font-semibold mt-0.5">{lease}</p>}
            {availableLabel && <p className="text-xs text-slate-500 mt-0.5">{availableLabel}</p>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${listing.scam_score > 0.7 ? "bg-red-500" : listing.scam_score > 0.4 ? "bg-amber-500" : "bg-emerald-500"}`} />
            <span className={`text-xs font-semibold ${riskColor}`}>{trustLabel}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
