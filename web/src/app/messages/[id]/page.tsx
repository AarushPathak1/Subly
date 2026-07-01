import { requireEduVerified } from "@/lib/auth";
import { fetchConversation, fetchMessages, fetchReviewEligibility } from "@/lib/actions";
import { AppNav } from "@/components/AppNav";
import { ThreadClient } from "./ThreadClient";
import { ReviewPrompt } from "./ReviewPrompt";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ThreadPage({ params }: { params: { id: string } }) {
  const user = await requireEduVerified();

  const [conversation, messages] = await Promise.all([
    fetchConversation(params.id),
    fetchMessages(params.id),
  ]);

  if (!conversation) notFound();

  const isLister = user.id === conversation.lister_id;
  const otherUserId = isLister ? conversation.renter_id : conversation.lister_id;

  const isRenter = user.id === conversation.renter_id;
  const isConfirmed = !!conversation.confirmed_at;
  const eligibility = isRenter && isConfirmed ? await fetchReviewEligibility(params.id) : null;
  const showReviewPrompt = !!eligibility?.eligible;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppNav active="messages" />

      <div className="max-w-2xl mx-auto w-full px-6 py-4 flex-1 flex flex-col">
        {/* Header */}
        <div className="mb-4">
          <Link
            href="/messages"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition mb-3"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All messages
          </Link>
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Listing</p>
              <p className="font-semibold text-slate-900 text-sm">{conversation.listing_title}</p>
              <p className="text-xs text-slate-500 mt-1">{conversation.other_email}</p>
            </div>
            <Link
              href={`/users/${otherUserId}`}
              className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition mt-1"
            >
              View profile →
            </Link>
          </div>
        </div>

        {/* Thread */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex-1">
          <ThreadClient
            conversationId={params.id}
            currentUserId={user.id}
            isLister={isLister}
            confirmedAt={conversation.confirmed_at ?? null}
            initialRentCents={conversation.initial_rent_cents}
            initialMessages={messages}
            listingTitle={conversation.listing_title}
          />
        </div>
      </div>

      {showReviewPrompt && (
        <ReviewPrompt
          conversationId={params.id}
          listerName={conversation.other_email}
        />
      )}
    </div>
  );
}
