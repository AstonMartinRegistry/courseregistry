import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_leaderboard`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit_count: 200 }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: err }, { status: response.status });
    }

    const data = await response.json();

    // Get total row count from course_popularity via RPC
    let totalRows = 0;
    try {
      const countRes = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/get_popularity_count`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      if (countRes.ok) {
        const count = await countRes.json();
        totalRows = typeof count === "number" ? count : 0;
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ leaderboard: data ?? [], totalRows });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 },
    );
  }
}
