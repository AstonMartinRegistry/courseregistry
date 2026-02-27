"use client";

import { useEffect, useState } from "react";
import { createClient } from "../utils/supabase/client";
import type { User } from "@supabase/supabase-js";

const STANFORD_DOMAIN = "@stanford.edu";

export function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);


  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.endsWith(STANFORD_DOMAIN)) {
      setError("Use your Stanford email (@stanford.edu)");
      setSubmitting(false);
      return;
    }

    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: { full_name: name.trim() || trimmedEmail.split("@")[0] },
            emailRedirectTo: undefined,
          },
        });
        if (err) throw err;
        setShowForm(false);
        setEmail("");
        setPassword("");
        setName("");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (err) throw err;
        setShowForm(false);
        setEmail("");
        setPassword("");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ width: 80, height: 28, background: "#eee", borderRadius: 4 }} />
    );
  }

  if (user) {
    const displayName =
      (user.user_metadata?.full_name as string) || user.email?.split("@")[0] || "You";
    return (
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={signOut}
          style={{
            fontFamily: '"Roboto Mono", monospace',
            fontSize: "10px",
            padding: "0.35rem 0.6rem",
            background: "#1a1a1a",
            color: "#f0f0f0",
            border: "none",
            cursor: "pointer",
            borderRadius: 0,
          }}
          title={user.email ?? undefined}
        >
          {displayName} · sign out
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowForm(!showForm);
          setError(null);
          setMode("signin");
        }}
        style={{
          fontFamily: '"Roboto Mono", monospace',
          fontSize: "10px",
          padding: "0.35rem 0.6rem",
          background: "#1a1a1a",
          color: "#f0f0f0",
          border: "none",
          cursor: "pointer",
          borderRadius: 0,
        }}
      >
        Sign in
      </button>
      {showForm && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            padding: "1rem",
            background: "#fff",
            border: "1px solid #ddd",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            minWidth: 260,
            zIndex: 1000,
          }}
        >
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setMode("signin")}
                style={{
                  fontFamily: '"Roboto Mono", monospace',
                  fontSize: "10px",
                  marginRight: "0.5rem",
                  padding: "0.2rem 0",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: mode === "signin" ? "underline" : "none",
                  color: "#1a1a1a",
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                style={{
                  fontFamily: '"Roboto Mono", monospace',
                  fontSize: "10px",
                  padding: "0.2rem 0",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: mode === "signup" ? "underline" : "none",
                  color: "#1a1a1a",
                }}
              >
                Sign up
              </button>
            </div>
            <input
              type="email"
              placeholder="you@stanford.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "0.4rem 0.5rem",
                marginBottom: "0.5rem",
                fontSize: "11px",
                fontFamily: '"Roboto Mono", monospace',
                border: "1px solid #ccc",
                boxSizing: "border-box",
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "0.4rem 0.5rem",
                marginBottom: mode === "signup" ? "0.5rem" : 0,
                fontSize: "11px",
                fontFamily: '"Roboto Mono", monospace',
                border: "1px solid #ccc",
                boxSizing: "border-box",
              }}
            />
            {mode === "signup" && (
              <input
                type="text"
                placeholder="Your name (for display)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.4rem 0.5rem",
                  marginTop: "0.5rem",
                  marginBottom: "0.5rem",
                  fontSize: "11px",
                  fontFamily: '"Roboto Mono", monospace',
                  border: "1px solid #ccc",
                  boxSizing: "border-box",
                }}
              />
            )}
            {error && (
              <div
                style={{
                  fontSize: "10px",
                  color: "#c00",
                  marginBottom: "0.5rem",
                  fontFamily: '"Roboto Mono", monospace',
                }}
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{
                fontFamily: '"Roboto Mono", monospace',
                fontSize: "10px",
                padding: "0.35rem 0.6rem",
                background: "#1a1a1a",
                color: "#f0f0f0",
                border: "none",
                cursor: submitting ? "wait" : "pointer",
                width: "100%",
              }}
            >
              {submitting ? "..." : mode === "signup" ? "Sign up" : "Sign in"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
