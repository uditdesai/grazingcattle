/**
 * Server-side Supabase client.
 *
 * HOW THIS WORKS:
 * This client runs on the server (inside route handlers and server
 * components). The key difference from the browser client is HOW it
 * reads and writes cookies — on the server, Next.js controls the cookies
 * API, so we have to hand Supabase two callbacks that proxy through it:
 *   getAll() — reads existing cookies from the incoming request
 *   setAll() — writes updated cookies onto the outgoing response
 *
 * Without this wiring, Supabase would have no way to store or read the
 * session on the server side.
 *
 * The try/catch in setAll() is intentional: if this is called from a
 * Server Component (not a route handler), Next.js won't let you set
 * cookies — but the middleware (middleware.ts) already handles session
 * refreshing for every request, so it's safe to swallow that error here.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — middleware handles the refresh.
          }
        },
      },
    },
  );
};
