import { requireEduVerified } from "@/lib/auth";
import { SublyLogo } from "@/components/SublyLogo";
import Link from "next/link";
import ListingForm from "./ListingForm";

export default async function NewListingPage() {
  await requireEduVerified();

  return (
    <div className="min-h-screen bg-slate-50">
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

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-2">New listing</p>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Post your sublease</h1>
          <p className="text-slate-500 text-sm">
            Your listing will be AI-scored for quality and scam signals before going live. Fill in as much detail as possible for better matches.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <ListingForm />
            </div>
          </div>

          {/* Sidebar tips */}
          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="8" fill="#4f46e5" fillOpacity="0.15" stroke="#4f46e5" strokeWidth="1.5" />
                  <path d="M9 5v5M9 12.5h.01" stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <p className="text-sm font-bold text-indigo-700">Tips for great listings</p>
              </div>
              <ul className="space-y-2 text-xs text-indigo-700 leading-relaxed">
                <li>✓ Add photos — listings with images get 3× more inquiries</li>
                <li>✓ Be specific about distance to campus</li>
                <li>✓ Mention amenities like parking, laundry, A/C</li>
                <li>✓ Set an accurate price — suspicious pricing triggers our fraud filter</li>
              </ul>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 2L3 5.5v5C3 13.9 5.7 16.8 9 18c3.3-1.2 6-4.1 6-7.5v-5L9 2z" fill="#10b981" fillOpacity="0.15" stroke="#10b981" strokeWidth="1.5" />
                  <path d="M6 9l2.5 2.5 3.5-4" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-sm font-bold text-emerald-700">AI Trust Engine</p>
              </div>
              <p className="text-xs text-emerald-700 leading-relaxed">
                Every listing is automatically scored for fraud signals. Avoid urgent language, pressure tactics, or unusual payment requests — not because we&apos;ll remove your listing, but because renters can see the score.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
              <p className="text-sm font-bold text-amber-700 mb-2">Image uploads</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Photos go directly to secure cloud storage — never through our servers. Max 5 images, 10MB each.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
