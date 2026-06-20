"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchMessages,
  sendMessage,
  createCheckoutSession,
  type ChatMessage,
} from "@/lib/actions";
import { calculateMatchFee } from "@/lib/fees";
import { capture } from "@/lib/posthog/client";

interface ThreadClientProps {
  conversationId: string;
  currentUserId: string;
  isLister: boolean;
  confirmedAt: string | null;
  initialRentCents: number;
  initialMessages: ChatMessage[];
}

export function ThreadClient({
  conversationId,
  currentUserId,
  isLister,
  confirmedAt: initialConfirmedAt,
  initialRentCents,
  initialMessages,
}: ThreadClientProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState(initialConfirmedAt);
  const [showConfirmPanel, setShowConfirmPanel] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isConfirmed = !!confirmedAt;
  const fee = calculateMatchFee(initialRentCents);
  const rentDisplay = `$${Math.round(initialRentCents / 100).toLocaleString()}/mo`;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const updated = await fetchMessages(conversationId);
      if (updated.length > 0) setMessages(updated);
    };
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [conversationId]);

  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setInput("");
    const { error } = await sendMessage(conversationId, body);
    if (!error) {
      capture("message_sent", {
        conversation_id: conversationId,
        is_lister: isLister,
        message_length: body.length,
      });
      const updated = await fetchMessages(conversationId);
      setMessages(updated);
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleProceedToPayment = async () => {
    setCheckoutLoading(true);
    const result = await createCheckoutSession(conversationId);
    if ("error" in result) {
      setCheckoutLoading(false);
      return;
    }
    window.location.href = result.url;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">

      {/* Status banner */}
      {isConfirmed ? (
        <div className="flex items-center gap-3 px-5 py-3 bg-emerald-50 border-b border-emerald-100">
          <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <p className="text-sm text-emerald-800 font-medium">
            Match confirmed — you&apos;re both moving forward.
          </p>
        </div>
      ) : isLister ? (
        <div className="border-b border-slate-100">
          {!showConfirmPanel ? (
            <div className="flex items-center justify-between gap-4 px-5 py-3 bg-indigo-50">
              <div>
                <p className="text-sm font-medium text-indigo-900">Found your person?</p>
                <p className="text-xs text-indigo-600 mt-0.5">
                  Confirm this match to lock it in — fee based on listed rent of {rentDisplay}.
                </p>
              </div>
              <button
                onClick={() => setShowConfirmPanel(true)}
                className="shrink-0 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
              >
                Confirm match
              </button>
            </div>
          ) : (
            <div className="px-5 py-4 bg-indigo-50 space-y-4">
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold text-indigo-900">Confirm this match</p>
                <button onClick={() => setShowConfirmPanel(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
              </div>

              {/* Fee breakdown */}
              <div className="bg-white rounded-xl border border-indigo-100 divide-y divide-slate-100 text-sm">
                <div className="flex justify-between px-4 py-3">
                  <span className="text-slate-700">Match confirmation fee</span>
                  <span className="font-semibold text-slate-900">${(fee / 100).toFixed(2)}</span>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                You&apos;re only charged when both of you are ready. No action required from the renter — this is a one-time fee for the match.
              </p>

              <button
                onClick={handleProceedToPayment}
                disabled={checkoutLoading}
                className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {checkoutLoading ? "Redirecting to payment…" : `Pay $${(fee / 100).toFixed(2)} and confirm`}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0 text-slate-400">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 7v4M8 5.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <p className="text-xs text-slate-500 leading-relaxed">
            If you and {isLister ? "the renter" : "the lister"} decide to move forward, the lister will confirm the match through Subly. No payment or action is needed from you — you&apos;ll see a confirmation here when it&apos;s done.
          </p>
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-slate-400 text-sm mt-8">No messages yet — say hello!</p>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUserId;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMine
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                }`}
              >
                <p>{msg.body}</p>
                <p className={`text-xs mt-1 ${isMine ? "text-indigo-200" : "text-slate-400"}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-slate-200 bg-white px-4 py-3 flex items-end gap-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send)"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
