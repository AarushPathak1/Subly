import { requireEduVerified } from "@/lib/auth";
import { SublyLogo } from "@/components/SublyLogo";
import Link from "next/link";
import VibeForm from "./VibeForm";

export default async function OnboardingPage() {
  const user = await requireEduVerified();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Minimal nav */}
      <nav className="bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <SublyLogo />
          <span className="text-xl font-bold tracking-tight text-slate-900">Subly</span>
        </Link>
        <span className="text-sm text-slate-500">Step 2 of 3 — Your Vibe</span>
      </nav>

      <div className="flex flex-1">
        {/* Left panel */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-violet-900 via-indigo-950 to-slate-900 flex-col justify-between p-12">
          <img
            src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=900&auto=format&fit=crop&q=80"
            alt="Students collaborating"
            className="absolute inset-0 w-full h-full object-cover opacity-20"
          />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-violet-500/20 border border-violet-400/30 rounded-full px-3 py-1 mb-8">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                <circle cx="7" cy="5.5" r="3.5" stroke="#c4b5fd" strokeWidth="1.2" />
                <path d="M2 13c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" stroke="#c4b5fd" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="7" cy="5.5" r="1.3" fill="#c4b5fd" />
              </svg>
              <span className="text-xs text-violet-300 font-medium">AI-powered matching</span>
            </div>
            <h2 className="text-3xl font-extrabold text-white mb-4 leading-tight">
              Tell us your vibe.<br />We&apos;ll find your place.
            </h2>
            <p className="text-slate-300 text-base leading-relaxed">
              Our AI reads your preferences and searches listings semantically — not just by filters. The more you share, the better your matches.
            </p>
          </div>
          <div className="relative z-10">
            <div className="bg-white/10 backdrop-blur border border-white/15 rounded-2xl p-5">
              <p className="text-xs text-slate-400 uppercase font-semibold tracking-wide mb-3">Example vibe</p>
              <p className="text-slate-200 text-sm italic leading-relaxed">
                &ldquo;Quiet place, ideally with my own bathroom. Close to the CS building. Dog-friendly is a must, no smokers. Prefer furnished or at least has a washer/dryer.&rdquo;
              </p>
              <div className="mt-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="text-xs text-violet-300 font-medium">Matched 4 listings · 96% avg score</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel — form */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-lg">
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-sm font-bold flex items-center justify-center">✓</div>
                <div className="h-px flex-1 bg-indigo-200" />
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center">2</div>
                <div className="h-px flex-1 bg-slate-200" />
                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-400 text-sm font-bold flex items-center justify-center">3</div>
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Vibe Check</h1>
              <p className="text-slate-500 text-sm leading-relaxed">
                Help our AI understand what you&apos;re looking for. The more detail, the better your matches — think of it as describing your ideal place to a friend.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <VibeForm university={user.university ?? ""} />
            </div>

            <p className="text-center text-xs text-slate-400 mt-6">
              You can update your preferences anytime from your dashboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
