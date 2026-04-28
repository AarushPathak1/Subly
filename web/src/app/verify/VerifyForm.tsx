"use client";

import { useFormState, useFormStatus } from "react-dom";
import { verifyEduEmail } from "@/lib/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition text-sm"
    >
      {pending ? "Verifying..." : "Verify Email"}
    </button>
  );
}

export default function VerifyForm() {
  const [state, action] = useFormState(verifyEduEmail, null);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          University email
        </label>
        <input
          name="email"
          type="email"
          required
          placeholder="you@university.edu"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
      </div>
      {state?.error && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
