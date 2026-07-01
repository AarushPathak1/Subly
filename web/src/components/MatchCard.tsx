"use client";

import { SubleaseCard, type CardListing } from "@/components/SubleaseCard";

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

export function MatchCard({ match, isSaved }: { match: MatchResult; isSaved: boolean }) {
  const card: CardListing = {
    id: match.listing_id,
    title: match.title ?? "Sublease listing",
    university: match.university,
    rent_cents: match.rent_cents ?? 0,
    available_from: match.available_from ?? "",
    available_to: match.available_to,
    bedrooms: match.bedrooms ?? 0,
    bathrooms: match.bathrooms ?? 0,
    image_url: match.image_url,
    scam_score: match.scam_score,
    score: match.score,
  };
  return <SubleaseCard listing={card} isSaved={isSaved} />;
}
