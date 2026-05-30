"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { SublyLogo } from "@/components/SublyLogo";
import { GetStartedFlow } from "@/components/GetStartedFlow";

export function LandingNav() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) return;
    const check = () => setDark(hero.getBoundingClientRect().bottom <= 0);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  return (
    <nav className={`sticky top-0 z-50 border-b transition-colors duration-300 ${
        dark
          ? "bg-slate-900 border-slate-800"
          : "bg-white/90 backdrop-blur border-slate-100"
      }`}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <SublyLogo />
            <span className={`text-xl font-bold tracking-tight transition-colors duration-300 ${dark ? "text-white" : "text-slate-900"}`}>
              Subly
            </span>
          </Link>

          <div className={`hidden md:flex items-center gap-8 text-sm font-medium transition-colors duration-300 ${dark ? "text-slate-400" : "text-slate-600"}`}>
            <Link href="#how-it-works" className={`transition-colors duration-300 ${dark ? "hover:text-white" : "hover:text-slate-900"}`}>How it works</Link>
            <Link href="#features" className={`transition-colors duration-300 ${dark ? "hover:text-white" : "hover:text-slate-900"}`}>Features</Link>
            <Link href="#testimonials" className={`transition-colors duration-300 ${dark ? "hover:text-white" : "hover:text-slate-900"}`}>Reviews</Link>
          </div>

          <div className="flex items-center gap-3">
            <SignedOut>
              <SignInButton mode="modal">
                <button className={`text-sm font-medium transition-colors duration-300 px-3 py-2 ${dark ? "text-slate-400 hover:text-white" : "text-slate-700 hover:text-slate-900"}`}>
                  Sign in
                </button>
              </SignInButton>
              <GetStartedFlow compact />
            </SignedOut>
            <SignedIn>
              <Link href="/dashboard" className={`text-sm font-medium transition-colors duration-300 ${dark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"}`}>
                Dashboard
              </Link>
              <Link href="/listings/new" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition">
                Post sublease
              </Link>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>
        </div>
      </nav>
  );
}
