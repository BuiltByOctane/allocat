import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// No caching — a min-version bump in Supabase must take effect immediately.
export const dynamic = "force-dynamic";

/**
 * Public app config for the native force-update gate.
 *
 * Returns the minimum required Android `versionCode`; the native shell compares
 * its own `App.getInfo().build` against this and hard-blocks if it's lower.
 * Readable pre-login (the gate runs before auth) via the `app_config` public
 * read RLS policy. Fails open: on any error returns `0` so we never lock users
 * out on a network/DB blip.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("app_config")
      .select("min_android_version_code, update_message")
      .eq("id", 1)
      .single();

    if (error || !data) {
      return NextResponse.json({ minAndroidVersionCode: 0, updateMessage: null });
    }

    return NextResponse.json({
      minAndroidVersionCode: data.min_android_version_code ?? 0,
      updateMessage: data.update_message ?? null,
    });
  } catch {
    return NextResponse.json({ minAndroidVersionCode: 0, updateMessage: null });
  }
}
