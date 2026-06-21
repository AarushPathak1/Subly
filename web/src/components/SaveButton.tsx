"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveListing, unsaveListing } from "@/lib/actions";

interface SaveButtonProps {
  listingId: string;
  initialSaved: boolean;
  variant?: "card" | "detail";
  onChange?: (saved: boolean) => void;
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill={filled ? "currentColor" : "none"}>
      <path d="M4 2.5h8a.5.5 0 0 1 .5.5v10.5l-4.5-3-4.5 3V3a.5.5 0 0 1 .5-.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function SaveButton({ listingId, initialSaved, variant = "card", onChange }: SaveButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isPending) return;

    const next = !saved;
    setSaved(next);

    startTransition(async () => {
      const result = next ? await saveListing(listingId) : await unsaveListing(listingId);
      if (result.error) {
        setSaved(!next);
        toast.error(result.error);
        return;
      }
      onChange?.(next);
      router.refresh();
    });
  }

  if (variant === "detail") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={saved}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition disabled:opacity-60 ${
          saved
            ? "bg-indigo-100 text-indigo-700 border-indigo-200"
            : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
        }`}
      >
        <BookmarkIcon filled={saved} />
        {saved ? "Saved" : "Save"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={saved}
      aria-label={saved ? "Unsave listing" : "Save listing"}
      className={`absolute top-2 right-2 z-10 flex items-center justify-center w-8 h-8 rounded-full backdrop-blur-sm transition disabled:opacity-60 ${
        saved
          ? "bg-indigo-600 text-white"
          : "bg-white/80 text-slate-600 hover:bg-white"
      }`}
    >
      <BookmarkIcon filled={saved} />
    </button>
  );
}
