import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { SublyLogo } from "@/components/SublyLogo";
import Link from "next/link";
import VerifyForm from "./VerifyForm";

export default async function VerifyPage() {
  const { userId } = auth();
  if (!userId) redirect("/");

  const user = await getSessionUser();
  if (user?.edu_verified) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Minimal nav */}
      <nav className="bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Dashboard
          </Link>
          <div className="w-px h-4 bg-slate-200" />
          <Link href="/" className="flex items-center gap-2">
            <SublyLogo size={24} />
            <span className="text-lg font-bold tracking-tight text-slate-900">Subly</span>
          </Link>
        </div>
        <span className="text-sm text-slate-500">Step 1 of 3 — Verify</span>
      </nav>

      <div className="flex flex-1">
        {/* Left panel — image + copy */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex-col justify-between p-12">
          <img
            src="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=900&auto=format&fit=crop&q=80"
            alt="University campus"
            className="absolute inset-0 w-full h-full object-cover opacity-20"
          />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 rounded-full px-3 py-1 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-emerald-300 font-medium">.edu gated platform</span>
            </div>
            <h2 className="text-3xl font-extrabold text-white mb-4 leading-tight">
              The only sublease platform<br />that actually checks.
            </h2>
            <p className="text-slate-300 text-base leading-relaxed">
              We require a verified university email before you can view or post a single listing. No bots. No scammers. Just students.
            </p>
          </div>
          <div className="relative z-10 space-y-4">
            {[
              {
                svg: (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2L2 6l8 4 8-4-8-4z" fill="white" fillOpacity="0.9" />
                    <path d="M2 6v6c0 3.3 3.6 6 8 6s8-2.7 8-6V6" stroke="white" strokeOpacity="0.6" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                ),
                text: "Only real university emails accepted",
              },
              {
                svg: (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2L3 5v5c0 4 3 7.5 7 8.5C14 17.5 17 14 17 10V5l-7-3z" fill="white" fillOpacity="0.15" stroke="white" strokeOpacity="0.8" strokeWidth="1.2" />
                    <path d="M7 10l2.5 2.5 4-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ),
                text: "Every listing AI-scored for fraud",
              },
              {
                svg: (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="8" r="5" stroke="white" strokeOpacity="0.8" strokeWidth="1.2" />
                    <path d="M7 13.5C4.5 14.5 3 16 3 18h14c0-2-1.5-3.5-4-4.5" stroke="white" strokeOpacity="0.8" strokeWidth="1.2" strokeLinecap="round" />
                    <circle cx="10" cy="8" r="2" fill="white" fillOpacity="0.9" />
                  </svg>
                ),
                text: "Personalized AI matching to your vibe",
              },
            ].map(({ svg, text }) => (
              <div key={text} className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">{svg}</span>
                <span className="text-sm text-slate-300 font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — form */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center">1</div>
                <div className="h-px flex-1 bg-slate-200" />
                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-400 text-sm font-bold flex items-center justify-center">2</div>
                <div className="h-px flex-1 bg-slate-200" />
                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-400 text-sm font-bold flex items-center justify-center">3</div>
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 mb-2">
                Verify your student email
              </h1>
              <p className="text-slate-500 text-sm leading-relaxed">
                Subly is exclusive to verified students. Enter your <strong className="text-slate-700">.edu</strong> address to unlock the platform — it only takes a moment.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <VerifyForm />
            </div>

            <p className="text-center text-xs text-slate-400 mt-6">
              By continuing, you agree to our{" "}
              <Link href="#" className="underline hover:text-slate-600">Terms</Link>{" "}
              and{" "}
              <Link href="#" className="underline hover:text-slate-600">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
