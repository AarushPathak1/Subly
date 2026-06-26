"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "";

function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  const ids = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(userId);
}

export async function approveInvite(id: string): Promise<{ magic_link?: string; email?: string; error?: string }> {
  const { userId } = await auth();
  if (!isAdmin(userId)) return { error: "Unauthorized" };

  const res = await fetch(`${GATEWAY}/api/auth/admin/invite-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": ADMIN_SECRET },
    body: JSON.stringify({ action: "approve" }),
  });

  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Failed to approve" };

  revalidatePath("/admin/invites");
  return { magic_link: data.magic_link, email: data.email };
}

export async function rejectInvite(id: string): Promise<{ error?: string }> {
  const { userId } = await auth();
  if (!isAdmin(userId)) return { error: "Unauthorized" };

  const res = await fetch(`${GATEWAY}/api/auth/admin/invite-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": ADMIN_SECRET },
    body: JSON.stringify({ action: "reject" }),
  });

  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Failed to reject" };

  revalidatePath("/admin/invites");
  return {};
}

export type ReportStatus = "open" | "reviewed" | "dismissed" | "actioned";

export interface Report {
  id: string;
  reporter_id: string;
  reporter_email?: string;
  target_kind: "listing" | "user" | "message";
  target_id: string;
  reason: string;
  details: string;
  status: ReportStatus;
  created_at: string;
}

export async function fetchReports(): Promise<Report[]> {
  const { userId } = await auth();
  if (!isAdmin(userId)) return [];

  const res = await fetch(`${GATEWAY}/api/listings/reports`, {
    headers: { "X-Internal-Secret": INTERNAL_SECRET },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export async function updateReportStatus(
  id: string,
  status: ReportStatus
): Promise<{ report?: Report; error?: string }> {
  const { userId } = await auth();
  if (!isAdmin(userId)) return { error: "Unauthorized" };

  const res = await fetch(`${GATEWAY}/api/listings/reports/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
    body: JSON.stringify({ status }),
  });

  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Failed to update report" };

  revalidatePath("/admin/reports");
  return { report: data };
}
