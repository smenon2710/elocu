import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * The signed-in user's id, for server pages and layouts — the user id they
 * pass into lib/store.ts, which scopes every read and write to it. A
 * signed-out visitor never gets past this: they're redirected to /sign-in.
 * (API routes use getApiUserId() below instead.)
 */
export async function getCurrentUserId(): Promise<string> {
  const { userId } = await auth.protect();
  return userId;
}

/**
 * The API-route counterpart: the signed-in user's id, or null. Route
 * handlers can't use getCurrentUserId() — Clerk's protect() treats a request
 * inside a route handler as a page request and answers with a sign-in
 * redirect, which the app's fetch() calls would then try to parse as JSON.
 * Pair with unauthorizedResponse() for a clean 401.
 */
export async function getApiUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Sign in required" }, { status: 401 });
}
