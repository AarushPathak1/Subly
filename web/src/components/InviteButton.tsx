"use client";

import { useState } from "react";
import { InviteModal } from "./InviteModal";

export function InviteButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-indigo-300 hover:text-white transition underline underline-offset-2"
      >
        Don&apos;t have a .edu address?
      </button>
      <InviteModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
