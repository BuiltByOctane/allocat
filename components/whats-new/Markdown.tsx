"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";

/** Internal paths use client-side navigation; everything else opens a new tab. */
function isInternal(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

const COMPONENTS: Components = {
  a: ({ href, children }) => {
    const h = href ?? "";
    if (isInternal(h)) {
      return (
        <Link href={h} className="font-semibold text-foreground underline underline-offset-2">
          {children}
        </Link>
      );
    }
    return (
      <a
        href={h}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-foreground underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element -- remote changelog images, unknown dimensions
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      loading="lazy"
      className="max-w-full rounded-[14px]"
    />
  ),
  h1: ({ children }) => <h3 className="text-[15px] font-bold text-foreground">{children}</h3>,
  h2: ({ children }) => <h3 className="text-[15px] font-bold text-foreground">{children}</h3>,
  h3: ({ children }) => <h4 className="text-[13.5px] font-bold text-foreground">{children}</h4>,
  h4: ({ children }) => <h4 className="text-[13.5px] font-bold text-foreground">{children}</h4>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded-md bg-tile px-1 py-0.5 font-mono text-[12px]">{children}</code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
  ),
};

/** Renders changelog markdown. Raw HTML is never rendered (no rehype-raw). */
export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  return (
    <div
      className={`space-y-2.5 text-[13px] leading-relaxed text-muted-foreground ${className}`}
    >
      <ReactMarkdown components={COMPONENTS}>{source}</ReactMarkdown>
    </div>
  );
}

export default Markdown;
