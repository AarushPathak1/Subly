import { requireEduVerified } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

export default async function ProfileRedirectPage() {
  await requireEduVerified();
  const { getToken } = await auth();
  const token = await getToken();

  const res = await fetch(`${GATEWAY}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) redirect("/dashboard");

  const { id } = await res.json();
  redirect(`/users/${id}`);
}
