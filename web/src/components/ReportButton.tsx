"use client";

import { useState } from "react";
import { submitReport, ReportReason, ReportTargetKind } from "@/lib/actions";

interface ReportButtonProps {
  targetKind: ReportTargetKind;
  targetId: string;
  label?: string;
}

const REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: "scam", label: "Scam or fraud" },
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Other" },
];

type Status = "idle" | "open" | "submitting" | "reported" | "already_reported";

export function ReportButton({ targetKind, targetId, label = "Report" }: ReportButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    setStatus("open");
    setError(null);
  }

  function handleCancel() {
    setStatus("idle");
    setReason("");
    setDetails("");
    setError(null);
  }

  async function handleSubmit() {
    if (!reason || status === "submitting") return;
    setStatus("submitting");
    setError(null);

    const result = await submitReport({
      target_kind: targetKind,
      target_id: targetId,
      reason,
      details: details.trim() || undefined,
    });

    if (result.ok) {
      setStatus("reported");
      return;
    }

    if (result.error === "You've already reported this.") {
      setStatus("already_reported");
      return;
    }

    setError(result.error);
    setStatus("open");
  }

  if (status === "reported") {
    return (
      <div className="space-y-1">
        <p className="text-xs text-slate-400">Thanks, we've received your report.</p>
        <button type="button" disabled className="text-xs text-slate-400 underline-offset-2 cursor-not-allowed">
          Reported
        </button>
      </div>
    );
  }

  if (status === "already_reported") {
    return <p className="text-xs text-slate-400">You've already reported this.</p>;
  }

  if (status === "idle") {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="text-xs text-slate-400 hover:text-red-600 underline-offset-2 hover:underline"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">Report this {targetKind}</h3>

        <div className="space-y-1.5">
          <label htmlFor="report-reason" className="text-xs font-medium text-slate-600">
            Reason
          </label>
          <select
            id="report-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as ReportReason)}
            disabled={status === "submitting"}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">Select a reason</option>
            {REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="report-details" className="text-xs font-medium text-slate-600">
            Details (optional)
          </label>
          <textarea
            id="report-details"
            value={details}
            maxLength={1000}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            disabled={status === "submitting"}
            placeholder="Anything else we should know?"
            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="text-right text-xs text-slate-400">{details.length}/1000</p>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleCancel}
            disabled={status === "submitting"}
            className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 disabled:opacity-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!reason || status === "submitting"}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {status === "submitting" ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}
