import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { SublyLogo } from "./SublyLogo";

interface AppNavProps {
  active?: "dashboard" | "browse" | "my-listings" | "new-listing" | "onboarding" | "messages";
  unreadMessages?: number;
}

export function AppNav({ active, unreadMessages = 0 }: AppNavProps) {
  return (
    <nav className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <SublyLogo />
          <span className="text-xl font-bold tracking-tight text-white">Subly</span>
        </Link>

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
              active === "new-listing"
                ? "text-indigo-400"
                : "text-slate-400 hover:text-white"
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
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-indigo-500" />
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
