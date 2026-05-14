"use server";

import { randomUUID } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  VerifyEmailSchema,
  VibeProfileSchema,
  ListingSchema,
} from "@/lib/schemas";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

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
