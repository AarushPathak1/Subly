"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createListing } from "@/lib/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition text-sm"
    >
      {pending ? "Posting..." : "Post Sublease"}
    </button>
  );
}

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none";
const labelCls = "block text-sm font-medium text-gray-700 mb-1";

export default function ListingForm() {
  const [state, action] = useFormState(createListing, null);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className={labelCls}>Listing title</label>
        <input
          name="title"
          type="text"
          required
          placeholder="e.g. Sunny 2BR near ASU campus"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea
          name="description"
          rows={4}
          placeholder="Tell renters about the space, vibe, nearby amenities..."
          className={`${inputCls} resize-none`}
        />
      </div>

      <div>
        <label className={labelCls}>Address</label>
        <input
          name="address"
          type="text"
          required
          placeholder="123 College Ave, Tempe, AZ 85281"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Nearest university</label>
        <input
          name="university_near"
          type="text"
          placeholder="e.g. ASU, UCLA"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Monthly rent ($)</label>
          <input
            name="rent"
            type="number"
            min="0"
            step="50"
            required
            placeholder="1200"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Bedrooms</label>
          <select name="bedrooms" defaultValue="1" className={`${inputCls} bg-white`}>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4+</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Bathrooms</label>
          <select name="bathrooms" defaultValue="1" className={`${inputCls} bg-white`}>
            <option value="1">1</option>
            <option value="1.5">1.5</option>
            <option value="2">2</option>
            <option value="2.5">2.5</option>
            <option value="3">3+</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Available from</label>
          <input name="available_from" type="date" required className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Available until (optional)</label>
        <input name="available_to" type="date" className={inputCls} />
      </div>

      {state?.error && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}

      <SubmitButton />
    </form>
  );
}
