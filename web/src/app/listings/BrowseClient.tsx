"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SaveButton } from "@/components/SaveButton";
import { leaseSummary } from "@/lib/leaseSummary";

interface Listing {
  id: string;
  title: string;
  address: string;
  university_near: string;
  rent_cents: number;
  available_from: string;
  available_to?: string;
  bedrooms: number;
  bathrooms: number;
  images: string[];
  scam_score: number;
  status: string;
}

function formatAvailableFrom(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const currentYear = new Date().getFullYear();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === currentYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return `Available ${d.toLocaleDateString("en-US", opts)}`;
}

function ListingCard({ listing, isSaved }: { listing: Listing; isSaved: boolean }) {
  const rent = `$${(listing.rent_cents / 100).toLocaleString()}/mo`;
  const lease = leaseSummary({ rent_cents: listing.rent_cents, available_from: listing.available_from, available_to: listing.available_to });
  const availableLabel = formatAvailableFrom(listing.available_from);
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
          <SaveButton listingId={listing.id} initialSaved={isSaved} variant="card" />
        </div>
      ) : (
        <div className={`relative h-44 flex items-end p-4 ${isHighRisk ? "bg-gradient-to-br from-red-900 to-red-950" : "bg-gradient-to-br from-indigo-900 to-slate-900"}`}>
          <SaveButton listingId={listing.id} initialSaved={isSaved} variant="card" />
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
            <p className="text-xs text-indigo-600 font-semibold mt-0.5">{lease}</p>
            {availableLabel && <p className="text-xs text-slate-500 mt-0.5">{availableLabel}</p>}
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

interface BrowseClientProps {
  listings: Listing[];
  universities: string[];
  defaultUniversity?: string;
  savedIds: string[];
}

export function BrowseClient({ listings, universities, defaultUniversity = "", savedIds }: BrowseClientProps) {
  const [university, setUniversity] = useState(defaultUniversity);
  const [maxRent, setMaxRent] = useState("");
  const [minBeds, setMinBeds] = useState("");

  const filtered = useMemo(() => {
    return listings.filter((l) => {
      if (university && l.university_near !== university) return false;
      if (maxRent && l.rent_cents > parseFloat(maxRent) * 100) return false;
      if (minBeds && l.bedrooms < parseInt(minBeds, 10)) return false;
      return true;
    });
  }, [listings, university, maxRent, minBeds]);

  const hasFilters = university || maxRent || minBeds;

  return (
    <>
      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-8 flex flex-wrap gap-3 items-end shadow-sm">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">University</label>
          <select
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          >
            <option value="">All universities</option>
            {universities.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Max rent / month</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              value={maxRent}
              onChange={(e) => setMaxRent(e.target.value)}
              placeholder="No limit"
              className="w-full pl-7 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        <div className="flex-1 min-w-[130px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Min bedrooms</label>
          <select
            value={minBeds}
            onChange={(e) => setMinBeds(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          >
            <option value="">Any</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
          </select>
        </div>

        {hasFilters && (
          <button
            onClick={() => { setUniversity(""); setMaxRent(""); setMinBeds(""); }}
            className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          {filtered.length} listing{filtered.length !== 1 ? "s" : ""}
          {hasFilters ? " matching filters" : " available"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center bg-white border border-slate-200 border-dashed rounded-2xl py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 3L26 9.5v9C26 23.5 20.5 27 14 28 7.5 27 2 23.5 2 18.5v-9L14 3z" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
              <circle cx="14" cy="16" r="4" stroke="#94a3b8" strokeWidth="1.5"/>
            </svg>
          </div>
          <p className="text-slate-600 font-semibold mb-1">No listings found</p>
          <p className="text-sm text-slate-400">
            {hasFilters ? "Try adjusting your filters." : "Be the first to post a sublease!"}
          </p>
          {!hasFilters && (
            <Link
              href="/listings/new"
              className="mt-5 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
            >
              Post a sublease
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((l) => <ListingCard key={l.id} listing={l} isSaved={savedIds.includes(l.id)} />)}
        </div>
      )}
    </>
  );
}
