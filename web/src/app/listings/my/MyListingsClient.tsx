"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateListingStatus } from "@/lib/actions";

interface Listing {
  id: string;
  title: string;
  address: string;
  university_near: string;
  rent_cents: number;
  available_from: string;
  bedrooms: number;
  bathrooms: number;
  images: string[];
  scam_score: number;
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  active:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  draft:   "bg-slate-100 text-slate-600 border-slate-200",
  paused:  "bg-amber-100 text-amber-700 border-amber-200",
  leased:  "bg-indigo-100 text-indigo-700 border-indigo-200",
  expired: "bg-red-50 text-red-500 border-red-100",
};

const STATUS_LABELS: Record<string, string> = {
  active:  "Active",
  draft:   "Processing…",
  paused:  "Paused",
  leased:  "Leased",
  expired: "Expired",
};

function MyListingCard({ listing }: { listing: Listing }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(listing.status);
  const router = useRouter();
  const rent = `$${(listing.rent_cents / 100).toLocaleString()}/mo`;

  function changeStatus(next: "active" | "paused" | "leased") {
    startTransition(async () => {
      const result = await updateListingStatus(listing.id, next);
      if (result.error) {
        toast.error(result.error);
      } else {
        setStatus(next);
        toast.success(`Listing ${next === "active" ? "reactivated" : next === "paused" ? "paused" : "marked as leased"}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition">
      {/* Image / placeholder */}
      {listing.images && listing.images.length > 0 ? (
        <div className="h-40 overflow-hidden bg-slate-100">
          <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-40 bg-gradient-to-br from-indigo-900 to-slate-900" />
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <Link
            href={`/listings/${listing.id}`}
            className="text-sm font-bold text-slate-900 hover:text-indigo-700 transition line-clamp-2 leading-snug"
          >
            {listing.title}
          </Link>
          <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}>
            {STATUS_LABELS[status] ?? status}
          </span>
        </div>

        <p className="text-sm font-bold text-slate-700 mb-1">{rent}</p>
        <p className="text-xs text-slate-400 mb-4">{listing.bedrooms}bd · {listing.bathrooms}ba · {listing.university_near || listing.address}</p>

        {/* Actions */}
        {status !== "expired" && status !== "leased" && (
          <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
            {(status === "active" || status === "paused") && (
              <Link
                href={`/listings/${listing.id}/edit`}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
              >
                Edit
              </Link>
            )}
            {status === "active" && (
              <button
                onClick={() => changeStatus("paused")}
                disabled={isPending}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition disabled:opacity-50"
              >
                Pause
              </button>
            )}
            {status === "paused" && (
              <button
                onClick={() => changeStatus("active")}
                disabled={isPending}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50"
              >
                Reactivate
              </button>
            )}
            {(status === "active" || status === "paused") && (
              <button
                onClick={() => changeStatus("leased")}
                disabled={isPending}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
              >
                Mark leased
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MyListingsClient({ listings }: { listings: Listing[] }) {
  const active   = listings.filter((l) => l.status === "active");
  const drafts   = listings.filter((l) => l.status === "draft");
  const paused   = listings.filter((l) => l.status === "paused");
  const leased   = listings.filter((l) => l.status === "leased");
  const expired  = listings.filter((l) => l.status === "expired");

  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center bg-white border border-slate-200 border-dashed rounded-2xl py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect x="4" y="4" width="20" height="20" rx="4" stroke="#4f46e5" strokeWidth="1.5"/>
            <path d="M10 14h8M14 10v8" stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="text-slate-700 font-bold mb-1">No listings yet</p>
        <p className="text-sm text-slate-400 mb-5">Post your first sublease and let Subly find you a renter.</p>
        <Link
          href="/listings/new"
          className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
        >
          Post a sublease
        </Link>
      </div>
    );
  }

  const sections = [
    { label: "Active", items: active },
    { label: "Processing", items: drafts },
    { label: "Paused", items: paused },
    { label: "Leased", items: leased },
    { label: "Expired", items: expired },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="space-y-10">
      {sections.map(({ label, items }) => (
        <div key={label}>
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">
            {label} <span className="text-slate-400 font-normal">({items.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((l) => <MyListingCard key={l.id} listing={l} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
