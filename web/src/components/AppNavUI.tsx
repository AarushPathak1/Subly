"use client";

import { useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { SublyLogo } from "./SublyLogo";

export type AppNavActive = "dashboard" | "browse" | "saved" | "my-listings" | "new-listing" | "settings" | "messages" | "profile";

export interface AppNavUIProps {
  active?: AppNavActive;
  unreadCount?: number;
}

interface NavLinkDef {
  key: AppNavActive;
  href: string;
  label: string;
}

const NAV_LINKS: NavLinkDef[] = [
  { key: "dashboard", href: "/dashboard", label: "My matches" },
  { key: "browse", href: "/listings", label: "Browse" },
  { key: "saved", href: "/listings/saved", label: "Saved" },
  { key: "my-listings", href: "/listings/my", label: "My listings" },
  { key: "new-listing", href: "/listings/new", label: "Post sublease" },
  { key: "messages", href: "/messages", label: "Messages" },
  { key: "settings", href: "/settings", label: "Settings" },
  { key: "profile", href: "/profile", label: "My profile" },
];

function NavLink({
  link,
  active,
  unreadCount,
  onClick,
  vertical = false,
}: {
  link: NavLinkDef;
  active?: AppNavActive;
  unreadCount: number;
  onClick?: () => void;
  vertical?: boolean;
}) {
  const isActive = active === link.key;
  return (
    <Link
      href={link.href}
      onClick={onClick}
      className={`relative text-sm font-medium transition ${vertical ? "block py-2.5" : ""} ${
        isActive ? "text-indigo-400" : "text-slate-400 hover:text-white"
      }`}
    >
      {link.label}
      {link.key === "messages" && unreadCount > 0 && (
        <span className={`${vertical ? "ml-2 inline-flex" : "absolute -top-1 -right-2.5"} min-w-[16px] h-4 px-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold items-center justify-center ${vertical ? "" : "flex"}`}>
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

export function AppNavUI({ active, unreadCount = 0 }: AppNavUIProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

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

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.key} link={link} active={active} unreadCount={unreadCount} />
          ))}
          <UserButton afterSignOutUrl="/" />
        </div>

        {/* Mobile hamburger */}
        <div className="flex items-center gap-3 md:hidden">
          <UserButton afterSignOutUrl="/" />
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute top-0 right-0 h-full w-64 bg-slate-900 border-l border-slate-800 px-6 py-5 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <span className="text-base font-bold text-white">Menu</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex flex-col">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.key}
                  link={link}
                  active={active}
                  unreadCount={unreadCount}
                  onClick={() => setDrawerOpen(false)}
                  vertical
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
