export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const required = [
      "CLERK_SECRET_KEY",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "GATEWAY_URL",
      "INTERNAL_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
    ];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
      throw new Error(`[web] missing required env vars: ${missing.join(", ")}`);
    }

    const warnings: string[] = [];
    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      warnings.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set — Stripe UI will not load");
    }
    if (!process.env.ALLOWED_ORIGINS) {
      warnings.push("ALLOWED_ORIGINS not set on gateway — CORS will allow all origins");
    }
    if (process.env.INTERNAL_SECRET === "dev-internal-secret-change-in-prod") {
      warnings.push("INTERNAL_SECRET is the default dev value — change it before going to production");
    }
    for (const w of warnings) {
      console.warn(`[web] WARNING: ${w}`);
    }
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.SENTRY_DSN) {
      await import("../sentry.server.config");
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    if (process.env.SENTRY_DSN) {
      await import("../sentry.edge.config");
    }
  }
}
