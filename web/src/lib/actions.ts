"use server";

import { randomUUID } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Stripe from "stripe";
import {
  VerifyEmailSchema,
  VibeProfileSchema,
  ListingSchema,
  InviteRequestSchema,
  ReviewSchema,
} from "@/lib/schemas";
import { getSessionUser } from "@/lib/auth";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

export type ActionState = { error: string } | { toast: string } | null;

async function getBearerToken(): Promise<string | null> {
  const { getToken } = auth();
  return getToken();
}

// ─── Verify .edu email ────────────────────────────────────────────────────────

export async function verifyEduEmail(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = VerifyEmailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };

  const res = await fetch(`${GATEWAY}/api/auth/verify-edu`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email: parsed.data.email }),
  });

  if (!res.ok) return { error: "Verification failed. Please try again." };

  const data = await res.json();
  if (!data.edu_verified) return { error: "That doesn't look like a .edu address." };

  redirect("/onboarding");
}

// ─── Save vibe profile ────────────────────────────────────────────────────────

export async function saveProfile(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = VibeProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };

  const res = await fetch(`${GATEWAY}/api/auth/profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      vibe_text: parsed.data.vibe_text,
      university: parsed.data.university,
      max_rent_cents: Math.round(parseFloat(parsed.data.max_rent) * 100),
      min_bedrooms: parseInt(parsed.data.min_bedrooms, 10),
    }),
  });

  if (!res.ok) return { error: "Failed to save profile. Please try again." };

  redirect("/dashboard");
}

// ─── Create listing ───────────────────────────────────────────────────────────

export async function createListing(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = ListingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };

  const images = formData.getAll("images") as string[];

  const res = await fetch(`${GATEWAY}/api/listings/listings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: parsed.data.title,
      description: parsed.data.description,
      address: parsed.data.address,
      university_near: parsed.data.university_near,
      rent_cents: Math.round(parseFloat(parsed.data.rent) * 100),
      available_from: parsed.data.available_from,
      available_to: parsed.data.available_to || undefined,
      bedrooms: parseInt(parsed.data.bedrooms, 10),
      bathrooms: parseFloat(parsed.data.bathrooms),
      amenities: [],
      images,
    }),
  });

  if (!res.ok) return { error: "Failed to create listing. Please try again." };

  // Return toast message so the client can display it before navigating away.
  return { toast: "Listing queued for AI verification" };
}

// ─── Update listing (edit) ────────────────────────────────────────────────────

export async function updateListing(
  listingId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = ListingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };

  const images = formData.getAll("images") as string[];

  const res = await fetch(`${GATEWAY}/api/listings/listings/${listingId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: parsed.data.title,
      description: parsed.data.description,
      address: parsed.data.address,
      university_near: parsed.data.university_near,
      rent_cents: Math.round(parseFloat(parsed.data.rent) * 100),
      available_from: parsed.data.available_from,
      available_to: parsed.data.available_to || undefined,
      bedrooms: parseInt(parsed.data.bedrooms, 10),
      bathrooms: parseFloat(parsed.data.bathrooms),
      images,
    }),
  });

  if (!res.ok) return { error: "Failed to update listing. Please try again." };
  return { toast: "Listing updated successfully" };
}

// ─── Update listing status ────────────────────────────────────────────────────

export async function updateListingStatus(
  listingId: string,
  status: "active" | "paused" | "leased"
): Promise<{ error?: string }> {
  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };

  const res = await fetch(`${GATEWAY}/api/listings/listings/${listingId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) return { error: "Failed to update status." };
  return {};
}

// ─── Request invite (non-.edu users) ─────────────────────────────────────────

export async function requestInvite(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = InviteRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const res = await fetch(`${GATEWAY}/api/auth/invite-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  if (res.status === 409) return { toast: "You're already on the list — we'll be in touch!" };
  if (res.status === 400) {
    const data = await res.json().catch(() => ({}));
    return { error: data.error ?? "Invalid request." };
  }
  if (!res.ok) return { error: "Something went wrong. Please try again." };

  return { toast: "You're on the list! We'll email you when a spot opens up." };
}

// ─── Messaging ───────────────────────────────────────────────────────────────

export interface ConversationDetail {
  id: string;
  listing_id: string;
  listing_title: string;
  renter_id: string;
  lister_id: string;
  other_email: string;
  last_message_at?: string;
  created_at: string;
  initial_rent_cents: number;
  confirmed_at?: string;
}

import { calculateMatchFee } from "@/lib/fees";

export async function createCheckoutSession(
  conversationId: string
): Promise<{ url: string } | { error: string }> {
  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };

  const conv = await fetchConversation(conversationId);
  if (!conv) return { error: "Conversation not found" };

  const user = await getSessionUser();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const fee = calculateMatchFee(conv.initial_rent_cents);

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Subly Match Confirmation",
            description: `Sublease match for "${conv.listing_title}"`,
          },
          unit_amount: fee,
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/messages/${conversationId}/confirmed?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/messages/${conversationId}`,
    metadata: { conversation_id: conversationId, ...(user?.id ? { user_id: user.id } : {}) },
  });

  return { url: session.url! };
}

export async function verifyAndConfirmMatch(
  conversationId: string,
  sessionId: string
): Promise<{ error?: string }> {
  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return { error: "Payment not completed" };
  } catch {
    return { error: "Could not verify payment" };
  }

  const res = await fetch(`${GATEWAY}/api/messages/conversations/${conversationId}/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ stripe_session_id: sessionId }),
  });

  if (!res.ok) return { error: "Failed to confirm match" };
  return {};
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export async function startConversation(listingId: string): Promise<void> {
  const token = await getBearerToken();
  if (!token) throw new Error("Not signed in");

  const res = await fetch(`${GATEWAY}/api/messages/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ listing_id: listingId }),
  });

  if (!res.ok) throw new Error("Failed to start conversation");
  const data = await res.json();
  redirect(`/messages/${data.id}`);
}

export async function fetchConversation(conversationId: string): Promise<ConversationDetail | null> {
  const token = await getBearerToken();
  if (!token) return null;
  try {
    const res = await fetch(`${GATEWAY}/api/messages/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const token = await getBearerToken();
  if (!token) return [];
  try {
    const res = await fetch(`${GATEWAY}/api/messages/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function sendMessage(
  conversationId: string,
  body: string
): Promise<{ error?: string }> {
  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };
  try {
    const res = await fetch(`${GATEWAY}/api/messages/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) return { error: "Failed to send message" };
    return {};
  } catch {
    return { error: "Failed to send message" };
  }
}

// ─── User profiles ────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  university: string;
  vibe_text: string;
  member_since: string;
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const token = await getBearerToken();
  if (!token) return null;
  try {
    const res = await fetch(`${GATEWAY}/api/listings/users/${userId}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── S3 pre-signed upload URL ─────────────────────────────────────────────────

export async function getPresignedUrl(
  filename: string,
  contentType: string
): Promise<{ url: string; publicUrl: string } | { error: string }> {
  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };

  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) return { error: "S3 not configured" };

  const key = `listings/${randomUUID()}/${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const client = new S3Client({ region });
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, { expiresIn: 300 });
  const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  return { url, publicUrl };
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export interface PublicReview {
  id: string;
  rating: number;
  body: string;
  created_at: string;
  reviewer_display_name: string;
  reviewer_university: string;
  listing_title: string;
}

export interface PublicStats {
  listings_total: number;
  universities_total: number;
  match_satisfaction_pct: number | null;
  avg_time_to_match_hours: number | null;
  review_count: number;
  as_of: string;
}

export interface ReviewEligibility {
  eligible: boolean;
  already_reviewed: boolean;
  reason?: "already_reviewed" | "not_confirmed" | "not_renter" | "not_found";
}

export async function submitReview(
  conversationId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = ReviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };

  const res = await fetch(`${GATEWAY}/api/listings/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      rating: parseInt(parsed.data.rating, 10),
      body: parsed.data.body,
    }),
  });

  if (res.status === 409) return { error: "You've already reviewed this match." };
  if (res.status === 422) return { error: "This match hasn't been confirmed yet." };
  if (!res.ok) return { error: "Failed to submit review. Please try again." };

  return { toast: "Thanks for your review!" };
}

export async function fetchReviewEligibility(conversationId: string): Promise<ReviewEligibility | null> {
  const token = await getBearerToken();
  if (!token) return null;
  try {
    const res = await fetch(`${GATEWAY}/api/listings/reviews/eligibility?conversation_id=${conversationId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchPublicReviews(): Promise<PublicReview[]> {
  try {
    const res = await fetch(`${GATEWAY}/api/public/reviews`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchPublicStats(): Promise<PublicStats | null> {
  try {
    const res = await fetch(`${GATEWAY}/api/public/stats`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Saved listings ───────────────────────────────────────────────────────────

export interface SavedListing {
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
  created_at: string;
  updated_at: string;
  saved_at: string;
}

export async function saveListing(listingId: string): Promise<{ error?: string }> {
  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };
  try {
    const res = await fetch(`${GATEWAY}/api/listings/saved`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ listing_id: listingId }),
    });
    if (!res.ok) return { error: "Failed to save listing" };
    return {};
  } catch {
    return { error: "Failed to save listing" };
  }
}

export async function unsaveListing(listingId: string): Promise<{ error?: string }> {
  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };
  try {
    const res = await fetch(`${GATEWAY}/api/listings/saved/${listingId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: "Failed to unsave listing" };
    return {};
  } catch {
    return { error: "Failed to unsave listing" };
  }
}

export async function fetchSavedListings(): Promise<SavedListing[]> {
  const token = await getBearerToken();
  if (!token) return [];
  try {
    const res = await fetch(`${GATEWAY}/api/listings/saved`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchSavedListingIds(): Promise<Set<string>> {
  const saved = await fetchSavedListings();
  return new Set(saved.map((s) => s.id));
}
