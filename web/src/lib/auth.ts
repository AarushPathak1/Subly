import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

export interface SessionUser {
  id: string;
  clerk_id: string;
  email: string;
  edu_verified: boolean;
  university: string | null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const { getToken } = auth();
  const token = await getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${GATEWAY}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Use in any Server Component or layout that requires a verified .edu account.
// Redirects to /verify for unverified or unknown users.
export async function requireEduVerified(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || !user.edu_verified) redirect("/verify");
  return user;
}
