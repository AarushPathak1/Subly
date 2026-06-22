"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveProfile } from "@/lib/actions";
import { UniversityCombobox } from "@/components/UniversityCombobox";

const inputCls =
  "w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-slate-50 placeholder:text-slate-400 transition";
const labelCls = "block text-sm font-semibold text-slate-700 mb-2";

function SubmitButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition shadow-sm shadow-indigo-200 text-sm"
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Saving...
        </span>
      ) : isEditing ? "Save changes →" : "Save & find my matches →"}
    </button>
  );
}

interface Existing {
  vibe_text: string;
  university: string;
  max_rent: string;
  min_bedrooms: string;
}

export default function VibeForm({
  university,
  existing,
  mode = "onboarding",
}: {
  university: string;
  existing?: Existing;
  mode?: "onboarding" | "settings";
}) {
  const [state, action] = useFormState(saveProfile, null);
  const isEditing = mode === "settings" || !!existing;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="mode" value={mode} />
      <div>
        <label className={labelCls}>
          Describe your ideal place{" "}
          <span className="text-slate-400 font-normal">(optional but recommended)</span>
        </label>
        <textarea
          name="vibe_text"
          rows={4}
          defaultValue={existing?.vibe_text ?? ""}
          placeholder="e.g. Quiet, clean, close to campus, pet-friendly, prefer 2+ bed, no smokers, furnished if possible..."
          className={`${inputCls} resize-none`}
        />
        <p className="text-xs text-slate-400 mt-1.5">Write naturally — our AI understands context, not just keywords.</p>
      </div>

      <div>
        <label className={labelCls}>University / area</label>
        <UniversityCombobox
          name="university"
          defaultValue={existing?.university ?? university}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Max rent / month</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
            <input
              name="max_rent"
              type="number"
              min="0"
              step="50"
              placeholder="1,500"
              required
              defaultValue={existing?.max_rent ?? ""}
              className={`${inputCls} pl-8`}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Min bedrooms</label>
          <select
            name="min_bedrooms"
            defaultValue={existing?.min_bedrooms ?? "1"}
            className={`${inputCls} bg-white cursor-pointer`}
          >
            <option value="1">1+ bedroom</option>
            <option value="2">2+ bedrooms</option>
            <option value="3">3+ bedrooms</option>
            <option value="4">4+ bedrooms</option>
          </select>
        </div>
      </div>

      {state && "error" in state && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
            <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 11h.01" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-red-600">{state.error}</p>
        </div>
      )}

      {state && "toast" in state && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
            <circle cx="8" cy="8" r="7" stroke="#10b981" strokeWidth="1.5" />
            <path d="M5.5 8.2l1.8 1.8 3.2-3.7" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-sm text-emerald-700">{state.toast}</p>
        </div>
      )}

      <SubmitButton isEditing={isEditing} />
    </form>
  );
}
