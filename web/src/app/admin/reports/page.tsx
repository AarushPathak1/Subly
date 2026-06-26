import { SublyLogo } from "@/components/SublyLogo";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { fetchReports } from "@/lib/adminActions";
import { ReportsTable } from "./ReportsTable";

export const dynamic = "force-dynamic";

function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  const ids = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(userId);
}

export default async function AdminReportsPage() {
  const { userId } = await auth();
  if (!isAdmin(userId)) notFound();

  const reports = await fetchReports();
  const openCount = reports.filter((r) => r.status === "open").length;

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

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Reports</h1>
            <p className="text-sm text-slate-500">
              {openCount > 0
                ? `${openCount} report${openCount > 1 ? "s" : ""} awaiting review`
                : "No open reports"}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <ReportsTable reports={reports} />
        </div>
      </div>
    </div>
  );
}
