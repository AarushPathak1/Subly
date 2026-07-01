"use client";

import { useState } from "react";
import { ReviewForm } from "./confirmed/ReviewForm";

export function ReviewPrompt({ conversationId, listerName }: { conversationId: string; listerName: string }) {
  const [expanded, setExpanded] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return null;

  return (
    <div className="max-w-2xl mx-auto w-full px-6 pb-6">
      {!expanded ? (
        // Collapsed banner
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">⭐</span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Rate your experience with {listerName}</p>
              <p className="text-xs text-slate-500">Your review helps other students trust Subly.</p>
            </div>
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="shrink-0 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
          >
            Leave a review
          </button>
        </div>
      ) : (
        // Expanded form
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            <p className="text-sm font-semibold text-slate-700">Rate your experience with {listerName}</p>
            <button
              onClick={() => setExpanded(false)}
              className="text-slate-400 hover:text-slate-600 transition text-lg leading-none"
              aria-label="Close review form"
            >
              ×
            </button>
          </div>
          <ReviewForm conversationId={conversationId} onSuccess={() => setSubmitted(true)} />
        </div>
      )}
    </div>
  );
}
