"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export function Label({
  htmlFor,
  children,
  className = "",
}: {
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={`t-label text-muted-foreground ${className}`}>
      {children}
    </label>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="t-body-sm text-neg mt-1.5">{children}</p>;
}

export const inputClasses =
  "w-full min-h-[44px] bg-background border border-border rounded-lg px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-info " +
  "disabled:opacity-40 transition-colors";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`${inputClasses} ${className}`} {...props} />;
});

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

/** Label + Input + error/hint, wired together with a generated id. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, containerClassName = "", id, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <Input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {hint && !error && (
        <p className="t-body-sm text-muted-foreground">{hint}</p>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
});
