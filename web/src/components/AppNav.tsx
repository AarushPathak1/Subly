import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { SublyLogo } from "./SublyLogo";

interface AppNavProps {
  active?: "dashboard" | "browse" | "my-listings" | "new-listing" | "onboarding";
}

export function AppNav({ active }: AppNavProps) {
  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <SublyLogo />
          <span className="text-xl font-bold tracking-tight text-slate-900">Subly</span>
        </Link>

        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className={`text-sm font-medium transition ${
              active === "dashboard" ? "text-indigo-600" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            My matches
          </Link>
          <Link
            href="/listings"
            className={`text-sm font-medium transition ${
              active === "browse" ? "text-indigo-600" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Browse
          </Link>
          <Link
            href="/listings/my"
            className={`text-sm font-medium transition ${
              active === "my-listings" ? "text-indigo-600" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            My listings
          </Link>
          <Link
            href="/listings/new"
            className={`text-sm font-medium transition ${
              active === "new-listing"
                ? "text-indigo-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Post sublease
          </Link>
          <Link
            href="/onboarding"
            className={`text-sm font-medium transition ${
              active === "onboarding" ? "text-indigo-600" : "text-slate-600 hover:text-slate-900"
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
