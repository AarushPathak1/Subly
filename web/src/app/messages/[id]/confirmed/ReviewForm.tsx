"use client";

import { useState, useTransition } from "react";
import { submitReview } from "@/lib/actions";
import { capture } from "@/lib/posthog/client";

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 16 16" fill={filled ? "#f59e0b" : "none"} stroke="#f59e0b" strokeWidth="1">
      <path d="M8 1l1.8 3.6L14 5.3l-3 2.9.7 4.1L8 10.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7L8 1z" />
    </svg>
  );
}

export function ReviewForm({ conversationId }: { conversationId: string }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (rating === 0) return;
    setError(null);

    const formData = new FormData();
    formData.set("rating", String(rating));
    formData.set("body", body);

    startTransition(async () => {
      const result = await submitReview(conversationId, null, formData);
      if (!result) return;
      if ("error" in result) {
        setError(result.error);
      } else if ("toast" in result) {
        setSubmitted(true);
        capture("review_submitted", { conversation_id: conversationId, rating });
      }
    });
  }

  if (submitted) {
    return (
      <div className="mt-8 px-6 py-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
        <p className="text-sm font-semibold text-emerald-700">Thanks for your review!</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 w-full max-w-sm border border-slate-200 rounded-2xl p-6 text-left">
      <h2 className="text-sm font-bold text-slate-900 mb-1">How was your match?</h2>
      <p className="text-xs text-slate-500 mb-4">Your review helps other students trust Subly.</p>

      <div className="flex gap-1 mb-4" onMouseLeave={() => setHoverRating(0)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            className="p-0.5"
          >
            <StarIcon filled={star <= (hoverRating || rating)} />
          </button>
        ))}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Optional: tell us about your experience"
        rows={3}
        maxLength={1000}
        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-slate-50 placeholder:text-slate-400 transition resize-none mb-4"
      />

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      <button
        type="submit"
        disabled={rating === 0 || isPending}
        className="w-full py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition"
      >
        {isPending ? "Submitting..." : "Submit review"}
      </button>
    </form>
  );
}
