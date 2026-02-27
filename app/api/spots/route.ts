import { createClient } from "../../utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids"); // comma-separated course IDs

  if (!idsParam) {
    return NextResponse.json({ spots: {} });
  }

  const ids = idsParam
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  if (ids.length === 0) {
    return NextResponse.json({ spots: {} });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spots")
    .select("course_id, user_email, user_display_name")
    .in("course_id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const spots: Record<number, { email: string; displayName: string }[]> = {};
  for (const row of data ?? []) {
    const cid = row.course_id as number;
    if (!spots[cid]) spots[cid] = [];
    const displayName =
      (row.user_display_name as string)?.trim() ||
      (row.user_email as string)?.split("@")[0] ||
      "";
    spots[cid].push({
      email: row.user_email as string,
      displayName: displayName || (row.user_email as string)?.split("@")[0] || "",
    });
  }

  return NextResponse.json({ spots });
}
