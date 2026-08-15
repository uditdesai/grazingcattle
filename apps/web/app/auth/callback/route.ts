/**
 * Auth callback route — exchanges the magic-link code for a session.
 *
 * HOW THIS WORKS:
 * When a user clicks the magic link in their email, Supabase redirects them
 * to this URL with a short-lived `code` in the query string:
 *   https://yourdomain.com/auth/callback?code=abc123...
 *
 * This route handler picks up that code, calls exchangeCodeForSession(),
 * which:
 *   a) Verifies the code with Supabase's server
 *   b) Gets back a real session (access token + refresh token)
 *   c) Stores that session in the cookies via our server client's setAll()
 *
 * After that, every subsequent request carries the session cookie, and
 * middleware can verify it on the server without hitting Supabase each time.
 *
 * This must be a route handler (not a page) because it needs to:
 *   - Read query parameters from the URL
 *   - Set cookies on the response
 *   - Redirect to a different page
 * None of which a React component can do directly.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` lets us redirect to a specific page after login (e.g. /dev).
  // Falls back to /dev if not specified.
  const next = searchParams.get("next") ?? "/dev";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — back to login with an error hint.
  return NextResponse.redirect(`${origin}/login?error=Could+not+sign+in`);
}
