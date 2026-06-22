"use client";

import type { ChatMessage, ViewingStatus } from "@/lib/actions";

interface ViewingProposalCardProps {
  message: ChatMessage;
  currentUserId: string;
  listingTitle: string;
  onRespond: (messageId: string, action: "accept" | "decline") => void;
  responding?: boolean;
}

const STATUS_PILL: Record<ViewingStatus, { label: string; className: string }> = {
  pending: { label: "Awaiting response", className: "bg-indigo-100 text-indigo-700" },
  accepted: { label: "Accepted", className: "bg-emerald-100 text-emerald-700" },
  declined: { label: "Declined", className: "bg-rose-100 text-rose-700" },
  superseded: { label: "Replaced by newer proposal", className: "bg-slate-100 text-slate-500" },
};

export function ViewingProposalCard({
  message,
  currentUserId,
  listingTitle,
  onRespond,
  responding = false,
}: ViewingProposalCardProps) {
  const viewing = message.viewing;
  if (!viewing) return null;

  const isMine = message.sender_id === currentUserId;
  const pill = STATUS_PILL[viewing.status];
  const proposedAtDisplay = new Date(viewing.proposed_at).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const canRespond = viewing.status === "pending" && !isMine;

  return (
    <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-white px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Viewing proposal</p>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${pill.className}`}>
          {pill.label}
        </span>
      </div>

      <p className="text-sm font-semibold text-slate-900">{proposedAtDisplay}</p>
      <p className="text-xs text-slate-500">{listingTitle}</p>

      {viewing.note && <p className="text-sm text-slate-700 italic">&ldquo;{viewing.note}&rdquo;</p>}

      {canRespond ? (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onRespond(message.id, "accept")}
            disabled={responding}
            className="flex-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => onRespond(message.id, "decline")}
            disabled={responding}
            className="flex-1 px-3 py-1.5 bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg hover:bg-rose-200 disabled:opacity-50 transition"
          >
            Decline
          </button>
        </div>
      ) : isMine && viewing.status === "pending" ? (
        <p className="text-xs text-slate-400 pt-1">Waiting for the other party to respond.</p>
      ) : null}
    </div>
  );
}
