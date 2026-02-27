import { createClient } from "../utils/supabase/server";
import { NextResponse } from "next/server";

const STANFORD_EMAIL_DOMAIN = "@stanford.edu";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user?.email) {
      if (!data.user.email.toLowerCase().endsWith(STANFORD_EMAIL_DOMAIN)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(
          `${origin}?error=stanford_email_required&message=Please sign in with your Stanford email (@stanford.edu)`
        );
      }
      return NextResponse.redirect(next.startsWith("/") ? `${origin}${next}` : next);
    }
  }

  return NextResponse.redirect(`${origin}?error=auth_error`);
}
