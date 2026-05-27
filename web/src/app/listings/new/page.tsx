import { requireEduVerified } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { SublyLogo } from "@/components/SublyLogo";
import Link from "next/link";
import { NewListingClient } from "./NewListingClient";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

export default async function NewListingPage() {
  await requireEduVerified();

  const { getToken } = auth();
  const token = await getToken();

  const profileRes = await fetch(`${GATEWAY}/api/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const nav = (
    <nav className="bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Dashboard
        </Link>
        <div className="w-px h-4 bg-slate-200" />
        <Link href="/dashboard" className="flex items-center gap-2">
          <SublyLogo size={24} />
          <span className="text-lg font-bold tracking-tight text-slate-900">Subly</span>
        </Link>
      </div>
      <span className="text-sm text-slate-500">Step 3 of 3 — Post a sublease</span>
    </nav>
  );

  if (profileRes.status === 404) {
    return (
      <div className="min-h-screen bg-slate-50">
        {nav}
        <div className="max-w-2xl mx-auto px-6 py-20 text-center">
          <div className="bg-white border border-violet-100 rounded-2xl p-10 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="10" stroke="#7c3aed" strokeWidth="1.5" fill="#ede9fe"/>
                <path d="M10 14h8M14 10v8" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Set up your preferences first</h2>
            <p className="text-sm text-slate-500 mb-7 leading-relaxed">
              Complete step 2 before posting a sublease. This helps our AI match your listing to the right renters.
            </p>
            <Link
              href="/onboarding"
              className="inline-block px-6 py-3 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition"
            >
              Complete step 2 →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {nav}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-2">New listing</p>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Post your sublease</h1>
          <p className="text-slate-500 text-sm">
            Your listing will be AI-scored for quality and scam signals before going live. Fill in as much detail as possible for better matches.
          </p>
        </div>
        <NewListingClient />
      </div>
    </div>
  );
}
