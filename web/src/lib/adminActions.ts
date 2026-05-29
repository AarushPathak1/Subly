"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  const ids = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(userId);
}

export async function approveInvite(id: string): Promise<{ magic_link?: string; email?: string; error?: string }> {
  const { userId } = auth();
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
  const { userId } = auth();
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
