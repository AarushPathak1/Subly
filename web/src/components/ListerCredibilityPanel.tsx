import Link from "next/link";
import { StarRating } from "@/components/StarRating";
import type { ReviewSummary } from "@/lib/actions";

export interface ListerCredibilityPanelProps {
  listerId: string;
  university: string | null;
  memberSince: string | null;
  eduVerified: boolean;
  summary: ReviewSummary;
  showProfileLink?: boolean;
}

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function ListerCredibilityPanel({
  listerId,
  university,
  memberSince,
  eduVerified,
  summary,
  showProfileLink = true,
}: ListerCredibilityPanelProps) {
  const initial = (university?.trim().charAt(0) || "S").toUpperCase();
  const heading = university ? `Student at ${university}` : "Subly Member";
  const hasRating = summary.count > 0;

  return (
    <section
      aria-label="About the lister"
      className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5"
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <span className="text-indigo-700 font-extrabold text-lg">{initial}</span>
        </div>

        {/* Identity + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-bold text-slate-900 truncate">{heading}</p>
            {eduVerified && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200"
                title=".edu email verified"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M2 5.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                .edu verified
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {memberSince && <span>Member since {formatMemberSince(memberSince)}</span>}
            {hasRating && (
              <span className="flex items-center gap-1.5" aria-label={`Rated ${summary.average?.toFixed(1)} out of 5 from ${summary.count} reviews`}>
                <StarRating value={summary.average ?? 0} size={12} />
                <span className="font-semibold text-slate-900">{summary.average?.toFixed(1) ?? "—"}</span>
                <span>({summary.count} review{summary.count === 1 ? "" : "s"})</span>
              </span>
            )}
            {!hasRating && (
              <span className="text-slate-400">No reviews yet</span>
            )}
          </div>
        </div>

        {/* Profile CTA — desktop only */}
        {showProfileLink && (
          <Link
            href={`/users/${listerId}`}
            className="hidden sm:inline-flex shrink-0 items-center px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition"
          >
            View profile
          </Link>
        )}
      </div>

      {/* Mobile-only profile link below */}
      {showProfileLink && (
        <Link
          href={`/users/${listerId}`}
          className="sm:hidden mt-3 inline-flex w-full justify-center items-center px-3 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition"
        >
          View profile
        </Link>
      )}
    </section>
  );
}
