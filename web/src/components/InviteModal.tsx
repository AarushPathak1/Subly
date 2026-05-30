"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { requestInvite } from "@/lib/actions";
import { toast } from "sonner";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition text-sm"
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Submitting...
        </span>
      ) : "Request access →"}
    </button>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSignUpDirectly?: () => void;
}

export function InviteModal({ open, onClose, onSignUpDirectly }: Props) {
  const [state, action] = useFormState(requestInvite, null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    if ("toast" in state) {
      toast.success(state.toast);
      onClose();
    }
  }, [state, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-black/50 backdrop-blur-sm overflow-y-auto"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 relative my-auto">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className="mb-6">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center mb-4">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M2 6l9 6 9-6" stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="2" y="4" width="18" height="14" rx="3" stroke="#4f46e5" strokeWidth="1.5" />
            </svg>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-1">Request early access</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Don&apos;t have a .edu address? Join the waitlist and we&apos;ll reach out when we open non-.edu access for your school.
          </p>
        </div>

        <form action={action} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Your email</label>
            <input
              name="email"
              type="email"
              required
              placeholder="you@gmail.com"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-slate-50 placeholder:text-slate-400 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">University or college</label>
            <input
              name="university_name"
              type="text"
              required
              placeholder="e.g. University of Texas at Austin"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-slate-50 placeholder:text-slate-400 transition"
            />
          </div>

          {state && "error" in state && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
                <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5" />
                <path d="M8 5v3.5M8 11h.01" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <p className="text-sm text-red-600">{state.error}</p>
            </div>
          )}

          <SubmitButton />
        </form>

        {onSignUpDirectly && (
          <p className="text-center text-xs text-slate-400 mt-4">
            Already have a .edu address?{" "}
            <button
              onClick={() => { onClose(); onSignUpDirectly(); }}
              className="text-indigo-600 font-medium hover:underline"
            >
              Sign up directly
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
