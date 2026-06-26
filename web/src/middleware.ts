import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtected = createRouteMatcher([
  "/verify(.*)",
  "/onboarding(.*)",
  "/dashboard(.*)",
  "/listings/new(.*)",
  "/settings(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
