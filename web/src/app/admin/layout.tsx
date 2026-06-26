import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  const ids = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(userId);
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();

  if (!userId) redirect("/");

  // If ADMIN_USER_IDS is not configured yet, show setup instructions
  if (!process.env.ADMIN_USER_IDS) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-amber-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" stroke="#d97706" strokeWidth="1.5" />
                <path d="M10 6v4.5M10 13.5h.01" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-slate-900">Admin access not configured</h1>
          </div>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            Add your Clerk user ID to <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">ADMIN_USER_IDS</code> in your <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">.env</code> file, then rebuild the web container.
          </p>
          <div className="bg-slate-900 rounded-xl px-4 py-3 font-mono text-xs text-emerald-400 mb-4">
            <p className="text-slate-400 mb-1"># Your Clerk user ID:</p>
            <p className="select-all">{userId}</p>
            <p className="text-slate-400 mt-3 mb-1"># Add to .env:</p>
            <p>ADMIN_USER_IDS={userId}</p>
          </div>
          <p className="text-xs text-slate-400">Then run: <code className="font-mono">docker compose up -d --build web</code></p>
        </div>
      </div>
    );
  }

  if (!isAdmin(userId)) notFound();

  return <>{children}</>;
}
