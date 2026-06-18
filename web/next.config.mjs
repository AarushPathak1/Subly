/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
    ],
  },
};

let exported = nextConfig;
if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const { withSentryConfig } = await import("@sentry/nextjs");
  exported = withSentryConfig(nextConfig, {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    disableLogger: true,
    widenClientFileUpload: true,
  });
}

export default exported;
