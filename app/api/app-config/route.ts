import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_FLAGS, parseFlags } from "@/lib/config/flags";

// No caching — a min-version bump or a flag flip in Supabase must take effect
// immediately, including inside already-shipped Android builds.
export const dynamic = "force-dynamic";

/**
 * Public app config for the native force-update gate and the runtime flags.
 *
 * Returns the minimum required Android `versionCode`; the native shell compares
 * its own `App.getInfo().build` against this and hard-blocks if it's lower.
 * Readable pre-login (the gate runs before auth) via the `app_config` public
 * read RLS policy. Fails open: on any error returns `0` plus the default flags
 * so we never lock users out — or dark a feature — on a network/DB blip.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("app_config")
      .select("min_android_version_code, update_message, flags")
      .eq("id", 1)
      .single();

    if (error || !data) {
      return NextResponse.json({
        minAndroidVersionCode: 0,
        updateMessage: null,
        flags: DEFAULT_FLAGS,
      });
    }

    return NextResponse.json({
      minAndroidVersionCode: data.min_android_version_code ?? 0,
      updateMessage: data.update_message ?? null,
      flags: parseFlags(data.flags),
    });
  } catch {
    return NextResponse.json({
      minAndroidVersionCode: 0,
      updateMessage: null,
      flags: DEFAULT_FLAGS,
    });
  }
}
