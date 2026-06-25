"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { SublyLogo } from "./SublyLogo";

export interface LegalNavProps {
  pageLabel: string;
}

export function LegalNav({ pageLabel }: LegalNavProps) {
  return (
    <nav className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <SublyLogo />
            <span className="text-xl font-bold tracking-tight text-white">Subly</span>
          </Link>
          <span className="text-slate-600 mx-1">/</span>
          <span className="text-sm text-slate-400">{pageLabel}</span>
        </div>

        <div className="flex items-center gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="text-sm font-medium text-slate-400 hover:text-white transition px-3 py-2">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard" className="text-sm font-medium text-slate-400 hover:text-white transition">
              Dashboard
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </div>
    </nav>
  );
}
