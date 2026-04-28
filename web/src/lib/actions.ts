"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

export type ActionState = { error: string } | null;

async function getBearerToken(): Promise<string | null> {
  const { getToken } = auth();
  return getToken();
}

// ─── Verify .edu email ────────────────────────────────────────────────────────

export async function verifyEduEmail(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };

  const email = formData.get("email") as string;
  const res = await fetch(`${GATEWAY}/api/auth/verify-edu`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email }),
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
  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };

  const maxRent = formData.get("max_rent") as string;
  const res = await fetch(`${GATEWAY}/api/auth/profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      vibe_text: formData.get("vibe_text"),
      university: formData.get("university"),
      max_rent_cents: Math.round(parseFloat(maxRent) * 100),
      min_bedrooms: parseInt(formData.get("min_bedrooms") as string, 10),
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
  const token = await getBearerToken();
  if (!token) return { error: "Not signed in" };

  const rent = formData.get("rent") as string;
  const availableTo = formData.get("available_to") as string;

  const res = await fetch(`${GATEWAY}/api/listings/listings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: formData.get("title"),
      description: formData.get("description"),
      address: formData.get("address"),
      university_near: formData.get("university_near"),
      rent_cents: Math.round(parseFloat(rent) * 100),
      available_from: formData.get("available_from"),
      available_to: availableTo || undefined,
      bedrooms: parseInt(formData.get("bedrooms") as string, 10),
      bathrooms: parseFloat(formData.get("bathrooms") as string),
      amenities: [],
      images: [],
    }),
  });

  if (!res.ok) return { error: "Failed to create listing. Please try again." };

  redirect("/dashboard");
}
