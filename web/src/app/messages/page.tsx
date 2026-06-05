import { requireEduVerified } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { AppNav } from "@/components/AppNav";
import Link from "next/link";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

interface Conversation {
  id: string;
  listing_title: string;
  other_email: string;
  last_message: string;
  last_message_at?: string;
  unread_count: number;
  created_at: string;
}

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function MessagesPage() {
  await requireEduVerified();
  const { getToken } = auth();
  const token = await getToken();

  const res = await fetch(`${GATEWAY}/api/messages/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const conversations: Conversation[] = res.ok ? await res.json() : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav active="messages" />

      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Messages</h1>

        {conversations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500 text-sm mb-4">No conversations yet.</p>
            <Link href="/listings" className="text-indigo-600 text-sm font-semibold hover:underline">
              Browse listings to find a sublease
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {conversations.map((c) => (
              <Link key={c.id} href={`/messages/${c.id}`} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-indigo-700 font-bold text-sm">
                    {c.other_email[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-slate-900 truncate">{c.listing_title}</span>
                    <span className="text-xs text-slate-400 shrink-0">{relativeTime(c.last_message_at ?? c.created_at)}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mb-0.5">{c.other_email}</p>
                  <p className="text-sm text-slate-600 truncate">
                    {c.last_message || <span className="italic text-slate-400">No messages yet</span>}
                  </p>
                </div>
                {c.unread_count > 0 && (
                  <span className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
