import { requireEduVerified } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { AppNav } from "@/components/AppNav";
import { fetchUserProfile } from "@/lib/actions";
import Link from "next/link";
import { notFound } from "next/navigation";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

interface Listing {
  id: string;
  title: string;
  university_near: string;
  rent_cents: number;
  available_from: string;
  bedrooms: number;
  bathrooms: number;
  images: string[];
  scam_score: number;
}

function formatMemberSince(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function ListingCard({ listing }: { listing: Listing }) {
  const rent = `$${(listing.rent_cents / 100).toLocaleString()}/mo`;
  const trustColor =
    listing.scam_score > 0.7 ? "text-red-500" :
    listing.scam_score > 0.4 ? "text-amber-500" : "text-emerald-500";
  const trustLabel =
    listing.scam_score > 0.7 ? "High Risk" :
    listing.scam_score > 0.4 ? "Review" : "Trusted";

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition flex flex-col"
    >
      {listing.images && listing.images.length > 0 ? (
        <div className="h-36 overflow-hidden bg-slate-100">
          <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
        </div>
      ) : (
        <div className="h-36 bg-gradient-to-br from-indigo-900 to-slate-900" />
      )}
      <div className="p-4 flex flex-col gap-1.5 flex-1">
        <h3 className="text-sm font-bold text-slate-900 line-clamp-2 group-hover:text-indigo-700 transition leading-snug">
          {listing.title}
        </h3>
        {listing.university_near && (
          <p className="text-xs text-slate-500">{listing.university_near}</p>
        )}
        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-extrabold text-slate-900">{rent}</p>
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

export default async function UserProfilePage({ params }: { params: { id: string } }) {
  await requireEduVerified();
  const { getToken } = auth();
  const token = await getToken();

  const [profile, listingsRes] = await Promise.all([
    fetchUserProfile(params.id),
    fetch(`${GATEWAY}/api/listings/listings?user_id=${params.id}`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
      cache: "no-store",
    }),
  ]);

  if (!profile) notFound();

  const listings: Listing[] = listingsRes.ok ? await listingsRes.json() : [];
  const initial = profile.university ? profile.university[0].toUpperCase() : "S";

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav />

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 mb-8">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0">
              <span className="text-indigo-700 font-extrabold text-3xl">{initial}</span>
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-extrabold text-slate-900 mb-1">
                {profile.university ? `Student at ${profile.university}` : "Subly Member"}
              </h1>
              <p className="text-sm text-slate-400 mb-4">
                Member since {formatMemberSince(profile.member_since)}
              </p>

              {profile.vibe_text ? (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Looking for</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{profile.vibe_text}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">No preferences listed yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Active listings */}
        <div>
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">
            Active listings <span className="text-slate-400 font-normal">({listings.length})</span>
          </h2>

          {listings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 border-dashed py-14 text-center">
              <p className="text-slate-400 text-sm">No active listings.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {listings.map((l) => <ListingCard key={l.id} listing={l} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
