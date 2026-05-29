"use client";

import { useState, useTransition } from "react";
import { approveInvite, rejectInvite } from "@/lib/adminActions";
import { toast } from "sonner";

type Status = "pending" | "approved" | "rejected" | "redeemed";

interface Invite {
  id: string;
  email: string;
  university_name: string | null;
  status: Status;
  redeemed_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<Status, string> = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-indigo-50 text-indigo-700 border-indigo-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
  redeemed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function InviteRow({ invite }: { invite: Invite }) {
  const [isPending, startTransition] = useTransition();
  const [magicLink, setMagicLink] = useState<string | null>(null);

  function handleApprove() {
    startTransition(async () => {
      const result = await approveInvite(invite.id);
      if (result.error) { toast.error(result.error); return; }
      setMagicLink(result.magic_link!);
      toast.success(`Approved ${result.email}`);
    });
  }

  function handleReject() {
    startTransition(async () => {
      const result = await rejectInvite(invite.id);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Request rejected");
    });
  }

  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-slate-900">{invite.email}</p>
        </td>
        <td className="px-4 py-3 text-sm text-slate-600">
          {invite.university_name ?? <span className="text-slate-400 italic">—</span>}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[invite.status]}`}>
            {invite.status}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-slate-400">
          {new Date(invite.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </td>
        <td className="px-4 py-3">
          {invite.status === "pending" && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleApprove}
                disabled={isPending}
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {isPending ? "..." : "Approve"}
              </button>
              <button
                onClick={handleReject}
                disabled={isPending}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 transition"
              >
                Reject
              </button>
            </div>
          )}
        </td>
      </tr>
      {magicLink && (
        <tr className="bg-indigo-50/60 border-b border-indigo-100">
          <td colSpan={5} className="px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                <path d="M2 7h10M7 2l5 5-5 5" stroke="#4f46e5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-indigo-700 font-medium">Magic link:</span>
              <code className="text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded font-mono truncate max-w-sm">
                {magicLink}
              </code>
              <CopyButton text={magicLink} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const TABS: { label: string; value: Status | "all" }[] = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Redeemed", value: "redeemed" },
  { label: "Rejected", value: "rejected" },
  { label: "All", value: "all" },
];

export function InviteTable({ invites }: { invites: Invite[] }) {
  const [tab, setTab] = useState<Status | "all">("pending");

  const filtered = tab === "all" ? invites : invites.filter((i) => i.status === tab);
  const countByStatus = (s: Status) => invites.filter((i) => i.status === s).length;

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {TABS.map(({ label, value }) => {
          const count = value === "all" ? invites.length : countByStatus(value as Status);
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
        <div className="text-center py-16 text-slate-400 text-sm">No {tab === "all" ? "" : tab} requests.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200">
                {["Email", "University", "Status", "Submitted", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((invite) => (
                <InviteRow key={invite.id} invite={invite} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
