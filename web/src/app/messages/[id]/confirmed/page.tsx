import { requireEduVerified } from "@/lib/auth";
import { verifyAndConfirmMatch, fetchConversation, fetchReviewEligibility } from "@/lib/actions";
import { AppNav } from "@/components/AppNav";
import { CaptureMatchConfirmed } from "./CaptureMatchConfirmed";
import { ReviewForm } from "./ReviewForm";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ConfirmedPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { session_id?: string };
}) {
  await requireEduVerified();

  const sessionId = searchParams.session_id;
  if (!sessionId) redirect(`/messages/${params.id}`);

  const [result, conversation] = await Promise.all([
    verifyAndConfirmMatch(params.id, sessionId),
    fetchConversation(params.id),
  ]);

  const failed = !!result.error && result.error !== "Failed to confirm match";

  const eligibility = !failed ? await fetchReviewEligibility(params.id) : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppNav active="messages" />

      <div className="max-w-xl mx-auto w-full px-6 py-16 flex flex-col items-center text-center">
        {failed ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.5"/>
                <path d="M8 8l8 8M16 8l-8 8" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Something went wrong</h1>
            <p className="text-slate-500 text-sm mb-8">{result.error}</p>
            <Link href={`/messages/${params.id}`} className="px-6 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition">
              Back to conversation
            </Link>
          </>
        ) : (
          <>
            <CaptureMatchConfirmed
              conversationId={params.id}
              listingTitleKnown={!!conversation?.listing_title}
            />
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="12" fill="#d1fae5" stroke="#059669" strokeWidth="1.5"/>
                <path d="M8 14l4 4 8-8" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Match confirmed!</h1>
            <p className="text-slate-500 text-sm leading-relaxed mb-8 max-w-sm">
              You&apos;ve locked in your sublease match for{" "}
              <span className="font-semibold text-slate-700">{conversation?.listing_title ?? "this listing"}</span>.
              The renter has been notified.
            </p>

            <div className="flex gap-3">
              <Link
                href={`/messages/${params.id}`}
                className="px-6 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
              >
                Back to conversation
              </Link>
              <Link
                href="/messages"
                className="px-6 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition"
              >
                All messages
              </Link>
            </div>

            {eligibility?.eligible && <ReviewForm conversationId={params.id} />}
            {eligibility?.already_reviewed && (
              <p className="mt-8 text-sm text-slate-500">Thanks for your review</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
