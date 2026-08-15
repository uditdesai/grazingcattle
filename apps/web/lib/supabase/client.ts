/**
 * Browser-side Supabase client.
 *
 * HOW THIS WORKS:
 * This client runs in the user's browser. It reads/writes the session
 * cookie via the browser's built-in cookie API. Used in client components
 * (files with "use client" at the top) — like the login form, where the
 * user types their email and we call supabase.auth.signInWithOtp().
 *
 * DO NOT use this in route handlers or server components. Use the server
 * client (server.ts) there instead — server-side code can't access
 * browser cookies the same way.
 *
 * NEXT_PUBLIC_ prefix: safe to expose to the browser. The anon key is
 * designed to be public — Supabase's Row Level Security policies control
 * what it can actually do.
 */

import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
