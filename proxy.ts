import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk's proxy makes the signed-in session available to auth() everywhere.
// It deliberately doesn't gate by URL pattern (Clerk deprecated
// createRouteMatcher for that): each resource checks for itself instead —
//   - app/(app)/layout.tsx redirects signed-out visitors away from every
//     app page;
//   - every API route starts with lib/auth.ts's getApiUserId() and answers
//     a signed-out call with 401 before doing anything;
//   - lib/store.ts scopes every query to that user id, which is what keeps
//     one user's data invisible to another.
// signInUrl/signUpUrl here (not only on <ClerkProvider>) so server-side
// redirects also land on our own /sign-in, not Clerk's hosted page.
export default clerkMiddleware({ signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
