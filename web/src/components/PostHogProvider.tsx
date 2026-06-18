"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { initPostHogClient, identify, getPostHog } from "@/lib/posthog/client";

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    try {
      const client = getPostHog();
      client?.capture("$pageview", { $current_url: window.location.href });
    } catch {
      // swallow — analytics must never break user-facing flows
    }
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, user } = useUser();

  useEffect(() => {
    initPostHogClient();
  }, []);

  useEffect(() => {
    if (isSignedIn && user?.id) {
      identify(user.id, { university: user.publicMetadata?.university ?? undefined });
    }
  }, [isSignedIn, user?.id, user?.publicMetadata]);

  return (
    <>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </>
  );
}
