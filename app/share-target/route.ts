import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const parts = [form.get("title"), form.get("text"), form.get("url")]
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const text = parts.join(" ").slice(0, 500);

  const target = new URL("/dashboard", req.url);
  if (text) target.searchParams.set("shared", text);

  return NextResponse.redirect(target, 303);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const text = [
    url.searchParams.get("title"),
    url.searchParams.get("text"),
    url.searchParams.get("url"),
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(" ")
    .slice(0, 500);

  const target = new URL("/dashboard", req.url);
  if (text) target.searchParams.set("shared", text);

  return NextResponse.redirect(target, 303);
}
