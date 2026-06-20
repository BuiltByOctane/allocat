"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "lime"
  | "secondary"
  | "ghost"
  | "outline"
  | "dashed"
  | "danger"
  | "link";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--pill)] text-[var(--pill-foreground)] hover:opacity-90 active:scale-[0.98]",
  lime:
    "bg-accent text-[var(--accent-ink)] hover:brightness-[0.97] active:scale-[0.98]",
  secondary:
    "bg-muted text-foreground hover:bg-muted/70 active:scale-[0.98]",
  ghost:
    "bg-transparent text-foreground hover:bg-muted active:scale-[0.98]",
  outline:
    "bg-card text-foreground border border-border hover:border-foreground/40 active:scale-[0.98]",
  dashed:
    "bg-transparent text-muted-foreground border-[1.5px] border-dashed border-border hover:text-foreground hover:border-foreground/40 active:scale-[0.98]",
  danger:
    "bg-[var(--neg-dim)] text-neg hover:brightness-95 active:scale-[0.98]",
  link:
    "bg-transparent text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground px-0 py-0 min-h-0",
};

// md/lg meet the 44px minimum tap target.
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-[38px] px-4 text-[13px] gap-1.5",
  md: "min-h-[46px] px-5 text-sm gap-2",
  lg: "min-h-[50px] px-6 text-[15px] gap-2",
};

function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  block?: boolean,
  className?: string,
) {
  return [
    "inline-flex items-center justify-center rounded-pill font-bold",
    "transition-all disabled:opacity-40 disabled:pointer-events-none select-none",
    VARIANTS[variant],
    variant === "link" ? "" : SIZES[size],
    block ? "w-full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> & {
    href?: undefined;
  };

type ButtonAsLink = BaseProps & {
  href: string;
  prefetch?: boolean;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const Spinner = () => (
  <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  props,
  ref,
) {
  const {
    variant = "primary",
    size = "md",
    block,
    loading,
    className,
    children,
  } = props;
  const classes = buttonClasses(variant, size, block, className);

  if ("href" in props && props.href !== undefined) {
    return (
      <Link href={props.href} prefetch={props.prefetch} className={classes}>
        {loading && <Spinner />}
        {children}
      </Link>
    );
  }

  const {
    href: _href,
    variant: _variant,
    size: _size,
    block: _block,
    loading: _loading,
    className: _className,
    children: _children,
    ...rest
  } = props as ButtonAsButton;
  void _href;
  void _variant;
  void _size;
  void _block;
  void _loading;
  void _className;
  void _children;
  return (
    <button
      ref={ref}
      className={classes}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

export { buttonClasses };
