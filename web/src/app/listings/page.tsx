import { requireEduVerified } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { AppNav } from "@/components/AppNav";
import Link from "next/link";
import { BrowseClient } from "./BrowseClient";
import { fetchSavedListingIds } from "@/lib/actions";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

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

export default async function BrowsePage() {
  const user = await requireEduVerified();
  const { getToken } = await auth();
  const token = await getToken();

  let listings: Listing[] = [];
  try {
    const res = await fetch(`${GATEWAY}/api/listings/listings`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) listings = await res.json();
  } catch { /* show empty state */ }

  const savedIds = Array.from(await fetchSavedListingIds());

  const universities = Array.from(
    new Set(listings.map((l) => l.university_near).filter(Boolean))
  ).sort() as string[];

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav active="browse" />

      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white mb-1">Browse subleases</h1>
            <p className="text-indigo-200 text-sm">
              {listings.length} active listing{listings.length !== 1 ? "s" : ""} · AI trust-scored
            </p>
          </div>
          <Link
            href="/listings/new"
            className="px-5 py-2.5 bg-white/15 hover:bg-white/25 backdrop-blur text-white text-sm font-semibold rounded-xl transition border border-white/20"
          >
            + Post your sublease
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <BrowseClient listings={listings} universities={universities} defaultUniversity={user.university ?? ""} savedIds={savedIds} />
      </div>
    </div>
  );
}
