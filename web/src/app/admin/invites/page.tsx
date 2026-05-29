import { SublyLogo } from "@/components/SublyLogo";
import Link from "next/link";
import { InviteTable } from "./InviteTable";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

export const dynamic = "force-dynamic";

export default async function AdminInvitesPage() {
  const res = await fetch(`${GATEWAY}/api/auth/admin/invite-requests`, {
    headers: { "X-Admin-Secret": ADMIN_SECRET },
    cache: "no-store",
  });

  const invites = res.ok ? await res.json() : [];

  const pendingCount = invites.filter((i: { status: string }) => i.status === "pending").length;

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <SublyLogo size={24} />
            <span className="text-lg font-bold tracking-tight text-slate-900">Subly</span>
          </Link>
          <div className="w-px h-4 bg-slate-200" />
          <span className="text-sm font-semibold text-slate-500">Admin</span>
        </div>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800 transition">
          Back to dashboard
        </Link>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Invite Requests</h1>
            <p className="text-sm text-slate-500">
              {pendingCount > 0
                ? `${pendingCount} request${pendingCount > 1 ? "s" : ""} waiting for review`
                : "No pending requests"}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <InviteTable invites={invites} />
        </div>
      </div>
    </div>
  );
}
