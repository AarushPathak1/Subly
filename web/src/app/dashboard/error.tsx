"use client";

import { useEffect } from "react";

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
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-12 max-w-md w-full text-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Could not load your matches
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          The matching service may be temporarily unavailable. Your listings
          and profile are safe.
        </p>
        <button
          onClick={reset}
          className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
