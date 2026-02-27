import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn("Supabase not configured, salad signup not stored:", email);
      return NextResponse.json({ ok: true });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/salad_bar_signups`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn("Salad bar signup failed:", res.status, err);
      return NextResponse.json({ ok: true }); // Still return ok so user doesn't see error
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.warn("Salad bar signup error:", e);
    return NextResponse.json({ ok: true }); // Still return ok so user doesn't see error
  }
}
