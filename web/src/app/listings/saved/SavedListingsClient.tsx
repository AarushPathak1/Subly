"use client";

import Link from "next/link";
import { SaveButton } from "@/components/SaveButton";
import type { SavedListing } from "@/lib/actions";

function SavedListingCard({ listing }: { listing: SavedListing }) {
  const rent = `$${(listing.rent_cents / 100).toLocaleString()}/mo`;
  const isHighRisk = listing.scam_score > 0.7;
  const trustColor = listing.scam_score > 0.7 ? "text-red-500" : listing.scam_score > 0.4 ? "text-amber-500" : "text-emerald-500";
  const trustLabel = listing.scam_score > 0.7 ? "High Risk" : listing.scam_score > 0.4 ? "Review" : "Trusted";

  return (
    <Link
      href={`/listings/${listing.id}`}
      className={`group bg-white rounded-2xl border overflow-hidden hover:shadow-lg transition flex flex-col ${
        isHighRisk ? "border-red-200" : "border-slate-200"
      }`}
    >
      {/* Image / placeholder */}
      {listing.images && listing.images.length > 0 ? (
        <div className="relative h-44 overflow-hidden bg-slate-100">
          <img
            src={listing.images[0]}
            alt={listing.title}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
          <SaveButton listingId={listing.id} initialSaved={true} variant="card" />
        </div>
      ) : (
        <div className={`relative h-44 flex items-end p-4 ${isHighRisk ? "bg-gradient-to-br from-red-900 to-red-950" : "bg-gradient-to-br from-indigo-900 to-slate-900"}`}>
          <SaveButton listingId={listing.id} initialSaved={true} variant="card" />
          {listing.university_near && (
            <span className="text-xs font-bold text-white/80 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full">
              {listing.university_near}
            </span>
          )}
        </div>
      )}

      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-indigo-700 transition">
            {listing.title}
          </h3>
        </div>

        {listing.university_near && (
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1C4.34 1 3 2.34 3 4c0 2.25 3 6 3 6s3-3.75 3-6c0-1.66-1.34-3-3-3z" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="6" cy="4" r="1.2" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            {listing.university_near}
          </p>
        )}

        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-base font-extrabold text-slate-900">{rent}</p>
            <p className="text-xs text-slate-400">{listing.bedrooms}bd · {listing.bathrooms}ba</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${listing.scam_score > 0.7 ? "bg-red-500" : listing.scam_score > 0.4 ? "bg-amber-500" : "bg-emerald-500"}`} />
            <span className={`text-xs font-semibold ${trustColor}`}>{trustLabel}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function SavedListingsClient({ listings }: { listings: SavedListing[] }) {
  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center bg-white border border-slate-200 border-dashed rounded-2xl py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
            <path d="M4 2.5h8a.5.5 0 0 1 .5.5v10.5l-4.5-3-4.5 3V3a.5.5 0 0 1 .5-.5z" stroke="#94a3b8" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className="text-slate-600 font-semibold mb-1">No saved listings yet</p>
        <p className="text-sm text-slate-400 mb-5">
          Bookmark a listing while browsing to come back to it later.
        </p>
        <Link
          href="/listings"
          className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
        >
          Browse listings
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {listings.map((l) => <SavedListingCard key={l.id} listing={l} />)}
    </div>
  );
}
