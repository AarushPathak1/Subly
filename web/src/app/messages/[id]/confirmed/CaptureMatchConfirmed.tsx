"use client";

import { useEffect, useRef } from "react";
import { capture } from "@/lib/posthog/client";

export function CaptureMatchConfirmed(props: { conversationId: string; listingTitleKnown: boolean }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    capture("match_confirmed", {
      conversation_id: props.conversationId,
      listing_title_known: props.listingTitleKnown,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
