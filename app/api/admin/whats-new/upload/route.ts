import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";
import { checkImageUpload, MAX_IMAGE_BYTES } from "@/lib/admin/whatsNewInput";

export const dynamic = "force-dynamic";

/**
 * POST multipart `file` → `{ url }` in the public `whats-new` bucket.
 *
 * A route handler, not a server action, so the global 1 MB server-action body
 * limit stays put. The client's MIME type and file name are never trusted:
 * the type must be allowlisted and match the file's magic bytes, and the
 * stored extension/content type come from the allowlist.
 */
export async function POST(req: Request) {
  await requireAdmin();

  // Cheap early reject before buffering the body.
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Image must be ≤ 2 MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImageUpload(file.type, bytes.byteLength, bytes.subarray(0, 16));
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const path = `${randomUUID()}.${check.ext}`;
  const storage = (createServiceClient() as unknown as SupabaseClient).storage.from("whats-new");
  const { error } = await storage.upload(path, bytes, { contentType: check.mime, upsert: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ url: storage.getPublicUrl(path).data.publicUrl });
}
