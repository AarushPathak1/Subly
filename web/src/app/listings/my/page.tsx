import { requireEduVerified } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { AppNav } from "@/components/AppNav";
import Link from "next/link";
import { MyListingsClient } from "./MyListingsClient";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

export default async function MyListingsPage() {
  const user = await requireEduVerified();
  const { getToken } = auth();
  const token = await getToken();

  let listings: unknown[] = [];
  try {
    const res = await fetch(`${GATEWAY}/api/listings/listings?user_id=${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) listings = await res.json();
  } catch { /* show empty state */ }

  const active  = (listings as { status: string }[]).filter((l) => l.status === "active").length;
  const draft   = (listings as { status: string }[]).filter((l) => l.status === "draft").length;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav active="my-listings" />

      {/* Header */}
      <div className="bg-gradient-to-r from-violet-700 to-indigo-700">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white mb-1">My listings</h1>
            <p className="text-indigo-200 text-sm">
              {active} active · {draft} processing
            </p>
          </div>
          <Link
            href="/listings/new"
            className="px-5 py-2.5 bg-white/15 hover:bg-white/25 backdrop-blur text-white text-sm font-semibold rounded-xl transition border border-white/20"
          >
            + Post new sublease
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <MyListingsClient listings={listings as Parameters<typeof MyListingsClient>[0]["listings"]} />
      </div>
    </div>
  );
}
