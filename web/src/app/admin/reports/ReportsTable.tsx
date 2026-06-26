"use client";

import { useState, useTransition } from "react";
import { updateReportStatus, type Report, type ReportStatus } from "@/lib/adminActions";
import { toast } from "sonner";

const STATUS_STYLES: Record<ReportStatus, string> = {
  open:      "bg-amber-50 text-amber-700 border-amber-200",
  reviewed:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  dismissed: "bg-slate-50 text-slate-500 border-slate-200",
  actioned:  "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function ReportRow({ report }: { report: Report }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<ReportStatus>(report.status);

  function handleUpdate(next: ReportStatus) {
    startTransition(async () => {
      const result = await updateReportStatus(report.id, next);
      if (result.error) { toast.error(result.error); return; }
      setStatus(next);
      toast.success(`Report marked ${next}`);
    });
  }

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors align-top">
      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
        {new Date(report.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        {report.reporter_email || <span className="text-slate-400 italic">unknown</span>}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 capitalize">{report.target_kind}</td>
      <td className="px-4 py-3 text-xs font-mono text-slate-500 max-w-[140px] truncate" title={report.target_id}>
        {report.target_id}
      </td>
      <td className="px-4 py-3 text-sm text-slate-700 capitalize">{report.reason}</td>
      <td className="px-4 py-3 text-sm text-slate-600 max-w-xs">
        {report.details || <span className="text-slate-400 italic">—</span>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status]}`}>
          {status}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleUpdate("reviewed")}
            disabled={isPending || status === "reviewed"}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            Mark Reviewed
          </button>
          <button
            onClick={() => handleUpdate("dismissed")}
            disabled={isPending || status === "dismissed"}
            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-50 transition"
          >
            Dismiss
          </button>
          <button
            onClick={() => handleUpdate("actioned")}
            disabled={isPending || status === "actioned"}
            className="px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50 transition"
          >
            Action Taken
          </button>
        </div>
      </td>
    </tr>
  );
}

const TABS: { label: string; value: ReportStatus | "all" }[] = [
  { label: "Open", value: "open" },
  { label: "Reviewed", value: "reviewed" },
  { label: "Actioned", value: "actioned" },
  { label: "Dismissed", value: "dismissed" },
  { label: "All", value: "all" },
];

export function ReportsTable({ reports }: { reports: Report[] }) {
  const [tab, setTab] = useState<ReportStatus | "all">("open");

  const filtered = tab === "all" ? reports : reports.filter((r) => r.status === tab);
  const countByStatus = (s: ReportStatus) => reports.filter((r) => r.status === s).length;

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {TABS.map(({ label, value }) => {
          const count = value === "all" ? reports.length : countByStatus(value as ReportStatus);
          return (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
                tab === value
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                  tab === value ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No {tab === "all" ? "" : tab} reports.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200">
                {["Date", "Reporter", "Target Kind", "Target ID", "Reason", "Details", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((report) => (
                <ReportRow key={report.id} report={report} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
