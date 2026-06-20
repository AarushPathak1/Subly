import posthog from "posthog-js";

export type PostHogEventName =
  | "listing_created"
  | "message_sent"
  | "match_confirmed"
  | "payment_completed"
  | "review_submitted";

let initialized = false;

export function initPostHogClient(): void {
  if (typeof window === "undefined") return;
  if (initialized) return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: false,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    autocapture: false,
  });

  initialized = true;
}

export function getPostHog(): import("posthog-js").PostHog | null {
  if (!initialized) return null;
  return posthog;
}

export function capture(event: PostHogEventName, properties?: Record<string, unknown>): void {
  try {
    const client = getPostHog();
    if (!client) return;
    client.capture(event, properties);
  } catch {
    // swallow — analytics must never break user-facing flows
  }
}

export function identify(distinctId: string, properties?: Record<string, unknown>): void {
  try {
    const client = getPostHog();
    if (!client) return;
    client.identify(distinctId, properties);
  } catch {
    // swallow — analytics must never break user-facing flows
  }
}

export function resetIdentity(): void {
  try {
    const client = getPostHog();
    if (!client) return;
    client.reset();
  } catch {
    // swallow — analytics must never break user-facing flows
  }
}
