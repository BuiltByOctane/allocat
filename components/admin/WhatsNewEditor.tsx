"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/whats-new/Markdown";
import { TagPill } from "@/components/whats-new/TagPill";
import { WHATS_NEW_TAGS, type WhatsNewEntry, type WhatsNewTag } from "@/lib/whats-new/types";
import {
  createWhatsNewEntry,
  updateWhatsNewEntry,
  uploadWhatsNewImage,
} from "@/lib/admin/whatsNew";

const field =
  "w-full rounded-tile bg-background px-3.5 py-2.5 t-body-sm border border-border outline-none focus:border-foreground/40";

/**
 * Create or edit one changelog entry. Without `entry` it is the "New entry"
 * form and resets after saving; with one it edits in place and calls `onDone`.
 */
export function WhatsNewEditor({
  entry,
  onDone,
}: {
  entry?: WhatsNewEntry;
  onDone?: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.body_md ?? "");
  const [tags, setTags] = useState<WhatsNewTag[]>(entry?.tags ?? []);
  const [imageUrl, setImageUrl] = useState<string | null>(entry?.image_url ?? null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (t: WhatsNewTag) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadWhatsNewImage(fd);
      if ("error" in res) setMsg(`✕ ${res.error}`);
      else setImageUrl(res.url);
    } catch (err) {
      setMsg(`✕ ${err instanceof Error ? err.message : "Upload failed"}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const input = { title, body_md: body, tags, image_url: imageUrl };
      const res = entry
        ? await updateWhatsNewEntry(entry.id, input)
        : await createWhatsNewEntry(input);
      if ("error" in res) {
        setMsg(`✕ ${res.error}`);
        return;
      }
      if (entry) {
        onDone?.();
      } else {
        setTitle("");
        setBody("");
        setTags([]);
        setImageUrl(null);
        setMsg("✓ Published.");
      }
      router.refresh();
    } catch (err) {
      setMsg(`✕ ${err instanceof Error ? err.message : "Save failed"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <input
        className={field}
        value={title}
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (≤120 chars)"
      />

      <div className="flex flex-wrap gap-2">
        {WHATS_NEW_TAGS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tags.includes(t)}
            onClick={() => toggle(t)}
            className={[
              "rounded-pill p-1 transition-opacity",
              tags.includes(t) ? "opacity-100 ring-2 ring-foreground/40" : "opacity-40 hover:opacity-70",
            ].join(" ")}
          >
            <TagPill tag={t} />
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <textarea
          className={`${field} min-h-[220px] resize-y font-mono`}
          value={body}
          maxLength={10_000}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Body (markdown)"
        />
        <div className="rounded-tile border border-dashed border-border p-3.5 min-h-[220px] overflow-auto">
          {body.trim() ? (
            <Markdown source={body} />
          ) : (
            <p className="t-body-sm text-muted-foreground">Preview</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- remote changelog image, unknown dimensions
          <img src={imageUrl} alt="" className="h-16 w-auto rounded-tile border border-border" />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => upload(e.target.files?.[0])}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={uploading || busy}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "Uploading…" : imageUrl ? "Replace image" : "Add image"}
        </Button>
        {imageUrl && (
          <Button size="sm" variant="ghost" disabled={uploading || busy} onClick={() => setImageUrl(null)}>
            Remove image
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="lime" disabled={busy || uploading || !title.trim()} onClick={save}>
          {entry ? "Save changes" : "Publish entry"}
        </Button>
        {entry && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDone}>
            Cancel
          </Button>
        )}
        {msg && <p className="t-body-sm font-semibold">{msg}</p>}
      </div>
    </div>
  );
}
