import { requireEduVerified } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { AppNav } from "@/components/AppNav";
import { notFound, redirect } from "next/navigation";
import { NewListingClient } from "../../new/NewListingClient";
import type { ListingInitialValues } from "../../new/ListingForm";

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
  images: string[];
  status: string;
}

export default async function EditListingPage({ params }: { params: { id: string } }) {
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

  // Only the owner can edit, and only active/paused listings
  if (listing.user_id !== user.id) redirect("/listings/my");
  if (listing.status === "leased" || listing.status === "draft") redirect("/listings/my");

  const initialValues: ListingInitialValues = {
    title: listing.title,
    description: listing.description,
    address: listing.address,
    university_near: listing.university_near,
    rent: String(listing.rent_cents / 100),
    bedrooms: String(listing.bedrooms),
    bathrooms: String(listing.bathrooms),
    available_from: listing.available_from,
    available_to: listing.available_to ?? "",
    images: listing.images ?? [],
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-violet-50">
      <AppNav active="my-listings" />

      <div className="bg-gradient-to-r from-violet-900 via-indigo-900 to-slate-900 px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold text-violet-300 uppercase tracking-widest mb-2">Editing</p>
          <h1 className="text-3xl font-extrabold text-white mb-2">{listing.title}</h1>
          <p className="text-indigo-200 text-sm">Editing your title, description, address, or rent sends your listing back to review — it will be temporarily unpublished until re-scored.</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <NewListingClient initialValues={initialValues} mode="edit" listingId={listing.id} />
      </div>
    </div>
  );
}
