"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";

const CONFIRM_WORD = "DELETE";

export function DeleteAccountSection() {
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { signOut } = useClerk();

  const canDelete = confirmText === CONFIRM_WORD && !submitting;

  async function handleDelete() {
    if (!canDelete) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        setError("Failed to delete account. Please try again.");
        setSubmitting(false);
        return;
      }
      await signOut();
      router.push("/");
    } catch {
      setError("Failed to delete account. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-8 mt-8">
      <h2 className="text-lg font-bold text-red-700 mb-2">Delete account</h2>
      <p className="text-sm text-slate-500 leading-relaxed mb-4">
        This immediately deactivates your account and pauses your active listings. Your data is
        permanently deleted after 30 days. This cannot be undone.
      </p>

      <label className="block text-sm font-semibold text-slate-700 mb-2">
        Type <span className="font-mono text-red-600">{CONFIRM_WORD}</span> to confirm
      </label>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={CONFIRM_WORD}
        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none bg-slate-50 placeholder:text-slate-400 transition mb-4"
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <button
        type="button"
        onClick={handleDelete}
        disabled={!canDelete}
        className="px-5 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm"
      >
        {submitting ? "Deleting..." : "Delete my account"}
      </button>
    </div>
  );
}
