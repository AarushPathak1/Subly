"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useClerk } from "@clerk/nextjs";
import { InviteModal } from "./InviteModal";

export function GetStartedFlow({ compact = false }: { compact?: boolean }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { openSignUp } = useClerk();

  useEffect(() => {
    if (modalOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [modalOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    if (modalOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  function closeModal() {
    setModalOpen(false);
    setEmail("");
    setError("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();

    if (!trimmed.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!trimmed.endsWith(".edu")) {
      closeModal();
      setInviteOpen(true);
      return;
    }

    closeModal();
    openSignUp({ initialValues: { emailAddress: trimmed } });
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className={compact
          ? "px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow-sm"
          : "px-7 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition shadow-lg shadow-indigo-900/50 text-base"
        }
      >
        {compact ? "Get started free" : "Get started for free"}
      </button>

      {/* Email gate modal — rendered via portal to escape navbar stacking context */}
      {modalOpen && typeof document !== "undefined" && createPortal(
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === overlayRef.current) closeModal(); }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 relative">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <div className="mb-6">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center mb-4">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M11 3L3 6.5v5C3 16 6.5 19.5 11 21c4.5-1.5 8-5 8-9.5v-5L11 3z" fill="#e0e7ff" stroke="#4f46e5" strokeWidth="1.5"/>
                  <path d="M7.5 11l2.5 2.5 4.5-4.5" stroke="#4f46e5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 mb-1">Create your account</h2>
              <p className="text-sm text-slate-500">Subly is exclusively for verified students — a <strong className="text-slate-700">.edu email</strong> is required to sign up.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">University email</label>
                <input
                  ref={inputRef}
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder="you@university.edu"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-slate-50 placeholder:text-slate-400 transition"
                />
                {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition text-sm"
              >
                Continue →
              </button>
            </form>

            <p className="text-center text-xs text-slate-400 mt-4">
              Don&apos;t have a .edu address?{" "}
              <button
                onClick={() => { closeModal(); setInviteOpen(true); }}
                className="text-indigo-600 font-medium hover:underline"
              >
                Request access
              </button>
            </p>
          </div>
        </div>,
        document.body
      )}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSignUpDirectly={() => { setInviteOpen(false); setModalOpen(true); }}
      />
    </>
  );
}
