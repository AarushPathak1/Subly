"use client";

import { useFormState, useFormStatus } from "react-dom";
import { verifyEduEmail } from "@/lib/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition text-sm shadow-sm shadow-indigo-200"
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Verifying...
        </span>
      ) : "Verify & continue →"}
    </button>
  );
}

export default function VerifyForm() {
  const [state, action] = useFormState(verifyEduEmail, null);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          University email address
        </label>
        <input
          name="email"
          type="email"
          required
          placeholder="you@university.edu"
          className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-slate-50 placeholder:text-slate-400 transition"
        />
        <p className="text-xs text-slate-400 mt-1.5">Must end in .edu — we&apos;ll verify your university affiliation.</p>
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
  );
}
