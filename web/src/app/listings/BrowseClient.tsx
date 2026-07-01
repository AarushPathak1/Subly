"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SubleaseCard, type CardListing } from "@/components/SubleaseCard";

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
          {filtered.map((l) => {
            const card: CardListing = {
              id: l.id,
              title: l.title,
              university: l.university_near,
              rent_cents: l.rent_cents,
              available_from: l.available_from,
              available_to: l.available_to ?? null,
              bedrooms: l.bedrooms,
              bathrooms: l.bathrooms,
              image_url: l.images && l.images.length > 0 ? l.images[0] : null,
              scam_score: l.scam_score,
            };
            return <SubleaseCard key={l.id} listing={card} isSaved={savedIds.includes(l.id)} />;
          })}
        </div>
      )}
    </>
  );
}
