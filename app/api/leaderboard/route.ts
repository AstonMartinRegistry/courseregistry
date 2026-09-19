import { NextRequest, NextResponse } from "next/server";

function getSupabaseConfig(term: string) {
  if (term === "autumn26") {
    return {
      url: process.env.AUTUMN26_SUPABASE_URL,
      anonKey: process.env.AUTUMN26_SUPABASE_ANON_KEY,
    };
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

function supabaseHeaders(key: string) {
  return {
    apikey: key,
    ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
  };
}

export async function GET(request: NextRequest) {
  try {
    const term = request.nextUrl.searchParams.get("term") || "autumn26";
    if (!['autumn26', 'spring26'].includes(term)) {
      return NextResponse.json({ error: "Unsupported course term" }, { status: 400 });
    }
    const { url, anonKey } = getSupabaseConfig(term);
    if (!url || !anonKey) {
      return NextResponse.json({ error: `${term} Supabase not configured` }, { status: 500 });
    }
    const leaderboardRpc = term === "autumn26" ? "get_leaderboard_autumn26" : "get_leaderboard";
    const countRpc = term === "autumn26" ? "get_popularity_count_autumn26" : "get_popularity_count";
    const response = await fetch(
      `${url}/rest/v1/rpc/${leaderboardRpc}`,
      {
        method: "POST",
        headers: {
          ...supabaseHeaders(anonKey),
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

    // Get the term-specific discovered-course count via its matching RPC.
    let totalRows = 0;
    try {
      const countRes = await fetch(
        `${url}/rest/v1/rpc/${countRpc}`,
        {
          method: "POST",
          headers: {
            ...supabaseHeaders(anonKey),
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
