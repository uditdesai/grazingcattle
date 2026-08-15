"use client";

/**
 * Login page — magic-link email sign-in.
 *
 * HOW THIS WORKS:
 * 1. User types their email and submits.
 * 2. We call supabase.auth.signInWithOtp({ email }) — "OTP" = one-time password,
 *    which is the magic link Supabase emails to them.
 * 3. User clicks the link in their email.
 * 4. That link hits /auth/callback?code=... on our server.
 * 5. The callback route (app/auth/callback/route.ts) exchanges the code for a
 *    real session and sets the session cookie.
 * 6. Middleware sees the session cookie on subsequent requests and lets them through.
 *
 * The browser Supabase client is used here (lib/supabase/client.ts) because
 * this is a "use client" component running in the browser.
 */

import { createClient } from "@/lib/supabase/client";
import { type CSSProperties, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const inputStyle: CSSProperties = {
  border: "1px solid #999",
  borderRadius: 4,
  padding: "8px 12px",
  fontFamily: "monospace",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  color: "#111",
  background: "#fff",
};

const buttonStyle: CSSProperties = {
  border: "1px solid #888",
  borderRadius: 4,
  padding: "8px 16px",
  background: "#f5f5f5",
  color: "#111",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: 14,
};

const LoginForm = () => {
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || status === "loading") return;

    setStatus("loading");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // After clicking the magic link, Supabase redirects to this URL.
        // The callback route exchanges the code for a session.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
    } else {
      setStatus("sent");
    }
  };

  return (
    <main style={{ fontFamily: "monospace", padding: 24, maxWidth: 400 }}>
      <h1>Grazing Cattle</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>
        Enter your email to receive a sign-in link.
      </p>
      {callbackError && (
        <p style={{ color: "red", marginBottom: 12 }}>
          Sign-in failed: {decodeURIComponent(callbackError)}. Please try again.
        </p>
      )}

      {status === "sent" ? (
        <p style={{ color: "#2a7a2a" }}>
          Check your email — a sign-in link is on its way.
          <br />
          <span style={{ color: "#555", fontSize: 12 }}>
            (Check spam if it doesn&apos;t arrive within a minute.)
          </span>
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <button type="submit" disabled={status === "loading"} style={buttonStyle}>
            {status === "loading" ? "Sending…" : "Send sign-in link"}
          </button>
          {status === "error" && (
            <p style={{ color: "red", margin: 0 }}>Error: {errorMessage}</p>
          )}
        </form>
      )}
    </main>
  );
};

// useSearchParams() requires a Suspense boundary in Next.js App Router.
// The outer component is the real page export; LoginForm does the actual work.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
