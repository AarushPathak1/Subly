import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { SublyLogo } from "./SublyLogo";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

interface AppNavProps {
  active?: "dashboard" | "browse" | "my-listings" | "new-listing" | "onboarding" | "messages";
}

async function fetchUnreadCount(token: string): Promise<number> {
  try {
    const res = await fetch(`${GATEWAY}/api/messages/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return 0;
    const convs: { unread_count: number }[] = await res.json();
    return convs.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
  } catch {
    return 0;
  }
}

export async function AppNav({ active }: AppNavProps) {
  const { getToken } = auth();
  const token = await getToken();
  const unreadCount = token ? await fetchUnreadCount(token) : 0;

  return (
    <nav className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {active !== "dashboard" && (
            <Link
              href="/dashboard"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Back to My matches"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          )}
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <SublyLogo />
            <span className="text-xl font-bold tracking-tight text-white">Subly</span>
          </Link>
        </div>

        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className={`text-sm font-medium transition ${
              active === "dashboard" ? "text-indigo-400" : "text-slate-400 hover:text-white"
            }`}
          >
            My matches
          </Link>
          <Link
            href="/listings"
            className={`text-sm font-medium transition ${
              active === "browse" ? "text-indigo-400" : "text-slate-400 hover:text-white"
            }`}
          >
            Browse
          </Link>
          <Link
            href="/listings/my"
            className={`text-sm font-medium transition ${
              active === "my-listings" ? "text-indigo-400" : "text-slate-400 hover:text-white"
            }`}
          >
            My listings
          </Link>
          <Link
            href="/listings/new"
            className={`text-sm font-medium transition ${
              active === "new-listing" ? "text-indigo-400" : "text-slate-400 hover:text-white"
            }`}
          >
            Post sublease
          </Link>
          <Link
            href="/messages"
            className={`relative text-sm font-medium transition ${
              active === "messages" ? "text-indigo-400" : "text-slate-400 hover:text-white"
            }`}
          >
            Messages
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          <Link
            href="/onboarding"
            className={`text-sm font-medium transition ${
              active === "onboarding" ? "text-indigo-400" : "text-slate-400 hover:text-white"
            }`}
          >
            Preferences
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </nav>
  );
}
