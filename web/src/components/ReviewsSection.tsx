import { PublicReview, ReviewSummary } from "@/lib/actions";
import { StarRating } from "@/components/StarRating";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ReviewsSection({
  title,
  reviews,
  summary,
}: {
  title: string;
  reviews: PublicReview[];
  summary: ReviewSummary;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">{title}</h2>
        <div className="flex items-center gap-2">
          <StarRating value={summary.average ?? 0} />
          <span className="text-sm font-semibold text-slate-900">
            {summary.average?.toFixed(1) ?? "—"}
          </span>
          <span className="text-xs text-slate-400">
            {summary.count} review{summary.count === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {summary.count === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 border-dashed py-10 text-center">
          <p className="text-slate-400 text-sm">No reviews yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {reviews.slice(0, 6).map((review) => (
            <div key={review.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{review.reviewer_display_name}</p>
                  {review.reviewer_university && (
                    <p className="text-xs text-slate-400">{review.reviewer_university}</p>
                  )}
                </div>
                <StarRating value={review.rating} />
              </div>
              {review.body && (
                <p className="text-sm text-slate-600 leading-relaxed mb-2">{review.body}</p>
              )}
              <div className="flex items-center justify-between text-xs text-slate-400">
                {review.listing_title && <span>{review.listing_title}</span>}
                <span>{formatDate(review.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
