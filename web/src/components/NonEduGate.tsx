"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { InviteModal } from "./InviteModal";
import { AppNav } from "./AppNav";

export function NonEduGate({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const { signOut } = useClerk();

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav />
      <div className="max-w-lg mx-auto px-6 py-20">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 3L4 7v7c0 5.5 4.3 10.7 10 12 5.7-1.3 10-6.5 10-12V7L14 3z" fill="#e0e7ff" stroke="#4f46e5" strokeWidth="1.5"/>
              <path d="M10 14l3 3 5-5" stroke="#4f46e5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <h2 className="text-xl font-bold text-slate-900 mb-2">A .edu email is required</h2>
          <p className="text-sm text-slate-500 mb-1 leading-relaxed">
            Subly is exclusively for verified university students.
          </p>
          {email && (
            <p className="text-xs text-slate-400 mb-7">
              Signed in as <span className="font-medium text-slate-600">{email}</span>
            </p>
          )}

          <div className="space-y-3">
            <button
              onClick={() => signOut({ redirectUrl: "/" })}
              className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition text-sm"
            >
              Sign in with a .edu email
            </button>
            <button
              onClick={() => setOpen(true)}
              className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition text-sm"
            >
              Don&apos;t have a .edu address? Request access
            </button>
          </div>
        </div>
      </div>

      <InviteModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
