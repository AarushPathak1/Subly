import { PostHog } from "posthog-node";
import type { PostHogEventName } from "./client";

export type { PostHogEventName };

let client: PostHog | null = null;
let attempted = false;

export function getServerPostHog(): PostHog | null {
  if (attempted) return client;
  attempted = true;

  const key = process.env.POSTHOG_API_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  const host =
    process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  client = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });
  return client;
}

export async function captureServer(args: {
  distinctId: string;
  event: PostHogEventName;
  properties?: Record<string, unknown>;
}): Promise<void> {
  try {
    const posthogClient = getServerPostHog();
    if (!posthogClient) return;
    posthogClient.capture({
      distinctId: args.distinctId,
      event: args.event,
      properties: args.properties,
    });
    await posthogClient.flush();
  } catch {
    // swallow — analytics must never affect caller behavior
  }
}

export async function shutdownServerPostHog(): Promise<void> {
  if (client) await client.shutdown();
}
