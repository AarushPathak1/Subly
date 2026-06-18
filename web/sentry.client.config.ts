import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers["Authorization"];
        delete event.request.headers["authorization"];
        delete event.request.headers["Cookie"];
        delete event.request.headers["cookie"];
      }
      return event;
    },
  });
}
