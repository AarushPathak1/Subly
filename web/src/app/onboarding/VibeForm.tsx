"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveProfile } from "@/lib/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition text-sm"
    >
      {pending ? "Saving..." : "Save & Find Matches"}
    </button>
  );
}

export default function VibeForm({ university }: { university: string }) {
  const [state, action] = useFormState(saveProfile, null);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Describe your ideal place or roommate vibe
        </label>
        <textarea
          name="vibe_text"
          rows={3}
          placeholder="e.g. Quiet, clean, close to campus, fine with pets, prefer 2+ bed..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          University / area
        </label>
        <input
          name="university"
          type="text"
          defaultValue={university}
          placeholder="e.g. ASU, UCLA, UT Austin"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max rent ($/mo)
          </label>
          <input
            name="max_rent"
            type="number"
            min="0"
            step="50"
            placeholder="1500"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min bedrooms
          </label>
          <select
            name="min_bedrooms"
            defaultValue="1"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white"
          >
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
          </select>
        </div>
      </div>

      {state?.error && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}

      <SubmitButton />
    </form>
  );
}
