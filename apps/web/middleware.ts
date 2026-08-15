/**
 * Next.js middleware — runs on every matched request before the page loads.
 *
 * HOW THIS WORKS:
 * Two jobs:
 *
 * 1. SESSION REFRESH
 *    Supabase sessions use JWTs that expire every hour. The browser can't
 *    refresh them on its own because the refresh token lives in an
 *    httpOnly cookie (JavaScript can't read it — that's a security feature).
 *    So the server has to do it. This middleware calls supabase.auth.getUser()
 *    on every request, which triggers a silent token refresh when needed and
 *    writes the new token back into the response cookies. Without this,
 *    users would get mysteriously logged out after an hour.
 *
 * 2. ROUTE PROTECTION
 *    If the request is for a protected route (anything that isn't /login or
 *    /auth/*) and there's no valid session, redirect to /login. This means
 *    you can never reach /dev without being signed in.
 *
 * The createServerClient() call here looks identical to server.ts but uses
 * NextRequest/NextResponse cookies instead of next/headers — middleware runs
 * in the Edge runtime, which has a slightly different API.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Start with a plain "pass through" response. We may mutate it below
  // to set refreshed session cookies before returning it.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write the refreshed cookies onto both the request (so the route
          // handler downstream can read them) and the response (so the
          // browser receives the updated token).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Always call getUser() — this is what triggers the token refresh.
  // Don't use getSession() here: it trusts the cookie without verifying
  // with the server, which is a security risk in middleware.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");

  // Unauthenticated user trying to reach a protected route → /login.
  if (!user && !isAuthRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user hitting /login → /dev (no point showing login again).
  if (user && pathname === "/login") {
    const devUrl = request.nextUrl.clone();
    devUrl.pathname = "/dev";
    return NextResponse.redirect(devUrl);
  }

  return response;
}

// Tell Next.js which paths to run middleware on.
// Excludes Next.js internals and static files — no need to check auth on
// images, fonts, or the favicon.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
