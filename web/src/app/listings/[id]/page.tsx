import { requireEduVerified } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { AppNav } from "@/components/AppNav";
import { startConversation, fetchSavedListingIds, fetchReviewsForLister, fetchReviewSummary } from "@/lib/actions";
import { SaveButton } from "@/components/SaveButton";
import { ReviewsSection } from "@/components/ReviewsSection";
import { ReportButton } from "@/components/ReportButton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { leaseSummary } from "@/lib/leaseSummary";
import { PhotoGallery } from "@/components/PhotoGallery";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

interface Listing {
  id: string;
  user_id: string;
  title: string;
  description: string;
  address: string;
  university_near: string;
  rent_cents: number;
  available_from: string;
  available_to?: string;
  bedrooms: number;
  bathrooms: number;
  amenities: string[];
  images: string[];
  status: string;
  scam_score: number;
  view_count: number;
  created_at: string;
  lease_type?: string;
  furnished?: string;
  utilities_included?: string[];
}

const LEASE_LABELS: Record<string, string> = {
  whole_place: "Whole place",
  private_room: "Private room",
  shared_room: "Shared room",
};
const FURNISHED_LABELS: Record<string, string> = {
  furnished: "Furnished",
  partially: "Partially furnished",
  unfurnished: "Unfurnished",
};

function TrustBadge({ score }: { score: number }) {
  if (score > 0.7) return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      High Risk
    </span>
  );
  if (score > 0.4) return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Needs Review
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Trusted
    </span>
  );
}

function formatDate(d?: string) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function ListingDetailPage({ params }: { params: { id: string } }) {
  const user = await requireEduVerified();
  const { getToken } = await auth();
  const token = await getToken();

  const res = await fetch(`${GATEWAY}/api/listings/listings/${params.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (res.status === 404) notFound();
  if (!res.ok) notFound();

  const listing: Listing = await res.json();
  const rent = `$${(listing.rent_cents / 100).toLocaleString()}/mo`;
  const isOwner = user.id === listing.user_id;
  const [savedIds, reviews, reviewSummary] = await Promise.all([
    isOwner ? Promise.resolve(new Set<string>()) : fetchSavedListingIds(),
    fetchReviewsForLister(listing.user_id),
    fetchReviewSummary({ lister_id: listing.user_id }),
  ]);
  const summary = reviewSummary ?? { average: null, count: 0 };
  const listerReviews = reviewSummary ? reviews : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav active="browse" />

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back */}
        <Link
          href="/listings"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition mb-6"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Browse listings
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Image gallery */}
          {listing.images && listing.images.length > 0 ? (
            <PhotoGallery images={listing.images} />
          ) : (
            <div className="h-56 bg-gradient-to-br from-indigo-900 to-slate-900 flex items-center justify-center">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-30">
                <rect x="4" y="10" width="40" height="28" rx="4" stroke="white" strokeWidth="2"/>
                <circle cx="18" cy="22" r="5" stroke="white" strokeWidth="2"/>
                <path d="M4 32l12-10 8 7 6-6 14 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}

          <div className="p-8">
            {/* Header row */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 mb-1">{listing.title}</h1>
                <p className="text-slate-500 text-sm flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1C4.79 1 3 2.79 3 5c0 3 4 8 4 8s4-5 4-8c0-2.21-1.79-4-4-4z" stroke="currentColor" strokeWidth="1.3"/>
                    <circle cx="7" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  </svg>
                  {listing.address}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <TrustBadge score={listing.scam_score} />
                {!isOwner && (
                  <SaveButton listingId={listing.id} initialSaved={savedIds.has(listing.id)} variant="detail" />
                )}
              </div>
            </div>

            {/* Key stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-indigo-50 rounded-xl p-4">
                <p className="text-xs text-indigo-500 font-semibold mb-1">Monthly rent</p>
                <p className="text-xl font-extrabold text-indigo-900">{rent}</p>
                <p className="text-[11px] text-indigo-700/80 mt-1 leading-tight">{leaseSummary(listing)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 font-semibold mb-1">Bedrooms</p>
                <p className="text-xl font-extrabold text-slate-900">{listing.bedrooms}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 font-semibold mb-1">Bathrooms</p>
                <p className="text-xl font-extrabold text-slate-900">{listing.bathrooms}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 font-semibold mb-1">Available</p>
                <p className="text-sm font-bold text-slate-900">{formatDate(listing.available_from)}</p>
              </div>
            </div>

            {/* Details grid */}
            <div className="grid sm:grid-cols-2 gap-8 mb-8">
              {listing.description && (
                <div className="sm:col-span-2">
                  <h2 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">About this place</h2>
                  <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">{listing.description}</p>
                </div>
              )}

              <div>
                <h2 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">Details</h2>
                <dl className="space-y-2">
                  {listing.university_near && (
                    <div className="flex justify-between text-sm">
                      <dt className="text-slate-500">Nearest university</dt>
                      <dd className="font-semibold text-slate-900">{listing.university_near}</dd>
                    </div>
                  )}
                  {listing.available_to && (
                    <div className="flex justify-between text-sm">
                      <dt className="text-slate-500">Available until</dt>
                      <dd className="font-semibold text-slate-900">{formatDate(listing.available_to)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <dt className="text-slate-500">Posted</dt>
                    <dd className="font-semibold text-slate-900">{formatDate(listing.created_at)}</dd>
                  </div>
                </dl>
              </div>

            </div>

            {/* What's Included */}
            {(listing.lease_type || listing.furnished || (listing.utilities_included && listing.utilities_included.length > 0) || (listing.amenities && listing.amenities.length > 0)) && (
              <div className="mb-8">
                <h2 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">What&apos;s Included</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {listing.lease_type && LEASE_LABELS[listing.lease_type] && (
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-500 font-semibold mb-1">Lease type</p>
                      <p className="text-sm font-bold text-slate-900">{LEASE_LABELS[listing.lease_type]}</p>
                    </div>
                  )}
                  {listing.furnished && FURNISHED_LABELS[listing.furnished] && (
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-500 font-semibold mb-1">Furnished</p>
                      <p className="text-sm font-bold text-slate-900">{FURNISHED_LABELS[listing.furnished]}</p>
                    </div>
                  )}
                  {listing.utilities_included && listing.utilities_included.length > 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 col-span-2">
                      <p className="text-xs text-slate-500 font-semibold mb-1">Utilities included</p>
                      <p className="text-sm font-bold text-slate-900">{listing.utilities_included.join(", ")}</p>
                    </div>
                  )}
                </div>
                {listing.amenities && listing.amenities.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold mb-2">Amenities</p>
                    <div className="flex flex-wrap gap-2">
                      {listing.amenities.map((a) => (
                        <span key={a} className="text-xs font-medium px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Trust score breakdown */}
            {listing.scam_score > 0.4 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <p className="text-sm font-semibold text-amber-800 mb-1">Trust notice</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Our AI flagged some signals in this listing. Always meet in person, never send deposits without viewing the property, and avoid payment apps.
                </p>
              </div>
            )}

            {/* CTA */}
            <div className="flex flex-wrap gap-3 pt-6 border-t border-slate-100">
              {user.id !== listing.user_id && (
                <>
                  <form action={startConversation.bind(null, listing.id)}>
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
                    >
                      Message lister
                    </button>
                  </form>
                  <Link
                    href={`/users/${listing.user_id}`}
                    className="px-5 py-2.5 bg-indigo-50 text-indigo-700 text-sm font-semibold rounded-xl hover:bg-indigo-100 transition"
                  >
                    View lister profile
                  </Link>
                </>
              )}
              <Link
                href="/dashboard"
                className="px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition"
              >
                Back to my matches
              </Link>
              <Link
                href="/listings"
                className="px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition"
              >
                Browse all listings
              </Link>
            </div>

            {!isOwner && (
              <div className="pt-4">
                <ReportButton targetKind="listing" targetId={listing.id} label="Report listing" />
              </div>
            )}

            {/* Reviews of this lister */}
            <div className="border-t border-slate-100 pt-6 mt-6">
              <ReviewsSection title="Reviews of this lister" reviews={listerReviews} summary={summary} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
