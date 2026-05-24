"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SublyLogo } from "@/components/SublyLogo";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5 w-fit">
          <SublyLogo />
          <span className="text-xl font-bold tracking-tight text-slate-900">Subly</span>
        </Link>
      </nav>

      <div className="flex items-center justify-center min-h-[80vh] p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-12 max-w-md w-full text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="12" stroke="#ef4444" strokeWidth="1.5" />
              <path d="M14 9v6M14 18.5h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">
            Couldn&apos;t load your matches
          </h2>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed">
            The matching service may be temporarily unavailable. Your listings and profile are safe — this is usually resolved in a moment.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={reset}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
            >
              Try again
            </button>
            <Link
              href="/"
              className="px-6 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
