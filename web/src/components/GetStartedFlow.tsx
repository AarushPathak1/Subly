"use client";

import { useState, useRef, useEffect } from "react";
import { useClerk } from "@clerk/nextjs";
import { InviteModal } from "./InviteModal";

type Step = "idle" | "email" | "invite";

export function GetStartedFlow({ compact = false }: { compact?: boolean }) {
  const [step, setStep] = useState<Step>("idle");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { openSignUp } = useClerk();

  useEffect(() => {
    if (step === "email") inputRef.current?.focus();
  }, [step]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();

    if (!trimmed.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!trimmed.endsWith(".edu")) {
      setError("");
      setInviteOpen(true);
      return;
    }

    setError("");
    openSignUp({ initialValues: { emailAddress: trimmed } });
    setStep("idle");
    setEmail("");
  }

  if (step === "idle") {
    return (
      <>
        <button
          onClick={() => setStep("email")}
          className={compact
            ? "px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow-sm"
            : "px-7 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition shadow-lg shadow-indigo-900/50 text-base"
          }
        >
          {compact ? "Get started free" : "Get started for free"}
        </button>
        <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      </>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 w-full max-w-sm">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="you@university.edu"
            className="flex-1 px-4 py-3 rounded-xl text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white/15 transition"
          />
          <button
            type="submit"
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition text-sm shrink-0"
          >
            Continue
          </button>
        </div>
        {error ? (
          <p className="text-xs text-red-400 pl-1">{error}</p>
        ) : (
          <p className="text-xs text-white/40 pl-1">
            Requires a .edu address —{" "}
            <button
              type="button"
              onClick={() => { setInviteOpen(true); setStep("idle"); }}
              className="underline hover:text-white/60 transition"
            >
              don&apos;t have one?
            </button>
          </p>
        )}
      </form>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}
