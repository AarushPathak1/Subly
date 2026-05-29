"use client";

import { SignUp } from "@clerk/nextjs";

interface Props {
  email: string;
  universityName: string;
  signedToken: string;
}

export function SignupWithInvite({ email, universityName, signedToken }: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-violet-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        {/* Approved badge */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l4 4 6-6" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Invite approved</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              {email} &middot; {universityName}
            </p>
          </div>
        </div>

        <SignUp
          afterSignUpUrl={`/signup/complete?signed=${encodeURIComponent(signedToken)}`}
          initialValues={{ emailAddress: email }}
        />
      </div>
    </div>
  );
}
