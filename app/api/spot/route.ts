import { createClient } from "../../utils/supabase/server";
import { NextResponse } from "next/server";

const STANFORD_EMAIL_DOMAIN = "@stanford.edu";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  if (!user.email.toLowerCase().endsWith(STANFORD_EMAIL_DOMAIN)) {
    return NextResponse.json({ error: "Stanford email required" }, { status: 403 });
  }

  const body = await request.json();
  const courseId = typeof body.courseId === "number" ? body.courseId : parseInt(body.courseId, 10);

  if (isNaN(courseId)) {
    return NextResponse.json({ error: "Invalid courseId" }, { status: 400 });
  }

  const displayName =
    (user.user_metadata?.full_name as string)?.trim() ||
    user.email?.split("@")[0] ||
    "";

  const { error } = await supabase.from("spots").upsert(
    {
      course_id: courseId,
      user_id: user.id,
      user_email: user.email,
      user_display_name: displayName,
    },
    { onConflict: "course_id,user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const courseId = parseInt(searchParams.get("courseId") ?? "", 10);

  if (isNaN(courseId)) {
    return NextResponse.json({ error: "Invalid courseId" }, { status: 400 });
  }

  const { error } = await supabase
    .from("spots")
    .delete()
    .eq("course_id", courseId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
