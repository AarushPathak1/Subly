"use client";

import { useState } from "react";

interface ProposeViewingModalProps {
  onSubmit: (proposedAtISO: string, note?: string) => void;
  onCancel: () => void;
  submitting?: boolean;
}

function minDateTimeLocal(): string {
  const d = new Date(Date.now() + 60 * 1000);
  d.setSeconds(0, 0);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function ProposeViewingModal({ onSubmit, onCancel, submitting = false }: ProposeViewingModalProps) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const min = minDateTimeLocal();

  const handleSubmit = () => {
    if (!value || submitting) return;
    const iso = new Date(value).toISOString();
    onSubmit(iso, note.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">Propose a viewing time</h3>

        <div className="space-y-1.5">
          <label htmlFor="proposed-at" className="text-xs font-medium text-slate-600">
            Date &amp; time
          </label>
          <input
            id="proposed-at"
            type="datetime-local"
            value={value}
            min={min}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="proposed-note" className="text-xs font-medium text-slate-600">
            Note (optional)
          </label>
          <textarea
            id="proposed-note"
            value={note}
            maxLength={280}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Anything the other party should know?"
            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="text-right text-xs text-slate-400">{note.length}/280</p>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 disabled:opacity-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value || submitting}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
