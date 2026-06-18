import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: 0.1,
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
