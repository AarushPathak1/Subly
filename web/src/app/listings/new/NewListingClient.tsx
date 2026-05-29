"use client";

import { useState } from "react";
import ListingForm from "./ListingForm";

const PROGRESS_ITEMS = [
  { key: "title", label: "Listing title" },
  { key: "description", label: "Description" },
  { key: "address", label: "Street address" },
  { key: "university_near", label: "Nearest university" },
  { key: "rent", label: "Monthly rent" },
  { key: "available_from", label: "Move-in date" },
  { key: "photos", label: "At least 1 photo" },
];

export function NewListingClient() {
  const [filled, setFilled] = useState<Record<string, boolean>>({});

  function handleFormChange(e: React.FormEvent<HTMLDivElement>) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if ("name" in target && target.name) {
      setFilled((prev) => ({ ...prev, [target.name]: !!target.value.trim() }));
    }
  }

  function handleImagesChange(count: number) {
    setFilled((prev) => ({ ...prev, photos: count > 0 }));
  }

  const completedCount = PROGRESS_ITEMS.filter((item) => filled[item.key]).length;
  const percentage = Math.round((completedCount / PROGRESS_ITEMS.length) * 100);
  const allDone = percentage === 100;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Main form */}
      <div className="lg:col-span-2 space-y-6">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1.5">New listing</p>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-1.5">Post your sublease</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Your listing will be AI-scored for quality and scam signals before going live. Fill in as much detail as possible for better matches.
          </p>
        </div>
        <div
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8"
          onChange={handleFormChange}
        >
          <ListingForm onImagesChange={handleImagesChange} />
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <div className="sticky top-24 space-y-4">

          {/* Progress tracker */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-900">Completeness</p>
              <span className={`text-sm font-bold tabular-nums ${allDone ? "text-emerald-600" : "text-indigo-600"}`}>
                {percentage}%
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mb-5">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${allDone ? "bg-emerald-500" : "bg-indigo-500"}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="space-y-2.5">
              {PROGRESS_ITEMS.map((item) => (
                <div key={item.key} className="flex items-center gap-2.5">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    filled[item.key] ? "bg-emerald-500" : "bg-slate-200"
                  }`}>
                    {filled[item.key] && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={`text-xs transition-colors ${
                    filled[item.key] ? "text-slate-800 font-medium" : "text-slate-400"
                  }`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            {allDone && (
              <div className="mt-4 pt-3 border-t border-emerald-100 flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <p className="text-xs text-emerald-700 font-semibold">Ready to post!</p>
              </div>
            )}
          </div>

          {/* Tips */}
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

          {/* Trust engine */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2L3 5.5v5C3 13.9 5.7 16.8 9 18c3.3-1.2 6-4.1 6-7.5v-5L9 2z" fill="#10b981" fillOpacity="0.15" stroke="#10b981" strokeWidth="1.5" />
                <path d="M6 9l2.5 2.5 3.5-4" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-sm font-bold text-emerald-700">AI Trust Engine</p>
            </div>
            <p className="text-xs text-emerald-700 leading-relaxed">
              Every listing is automatically scored for fraud signals. Avoid urgent language, pressure
              tactics, or unusual payment requests — renters can see your trust score.
            </p>
          </div>

          {/* Image uploads */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-amber-700 mb-2">Image uploads</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Photos go directly to secure cloud storage — never through our servers. Max 5 images, 10MB each.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
