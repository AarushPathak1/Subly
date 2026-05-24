import { SublyLogo } from "@/components/SublyLogo";
import Link from "next/link";

function SkeletonCard() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden animate-pulse">
      <div className="h-40 bg-gradient-to-br from-slate-200 to-slate-300" />
      <div className="p-4 space-y-3">
        <div className="h-3 w-3/4 bg-slate-200 rounded-full" />
        <div className="h-3 w-1/2 bg-slate-200 rounded-full" />
        <div className="flex justify-between mt-4 pt-3 border-t border-slate-100">
          <div className="h-3 w-16 bg-slate-200 rounded-full" />
          <div className="h-3 w-20 bg-slate-200 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <SublyLogo />
            <span className="text-xl font-bold tracking-tight text-slate-900">Subly</span>
          </Link>
          <div className="flex gap-6">
            <div className="h-4 w-20 bg-slate-200 rounded-full animate-pulse" />
            <div className="h-4 w-24 bg-slate-200 rounded-full animate-pulse" />
            <div className="h-4 w-20 bg-slate-200 rounded-full animate-pulse" />
            <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
          </div>
        </div>
      </nav>

      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="h-7 w-48 bg-white/20 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-72 bg-white/15 rounded-lg animate-pulse" />
          <div className="flex gap-4 mt-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 w-28 animate-pulse">
                <div className="h-3 w-16 bg-white/20 rounded mb-2" />
                <div className="h-7 w-10 bg-white/25 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
