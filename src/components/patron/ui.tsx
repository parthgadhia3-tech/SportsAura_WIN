"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function PrimaryButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full rounded-xl bg-brand px-5 py-4 font-display text-xl font-bold tracking-wide text-on-brand transition active:scale-[.98] disabled:opacity-40 ${className}`}
    />
  );
}

export function GhostButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full rounded-xl border border-ink/25 px-5 py-3 font-semibold text-ink transition active:scale-[.98] disabled:opacity-40 ${className}`}
    />
  );
}

export function Check({
  checked,
  onChange,
  children,
  required,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface/70 p-4 text-[15px] leading-snug">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-[var(--brand-primary)]"
        aria-required={required}
      />
      <span>
        {children}
        {required ? <span className="text-ink/50"> (required)</span> : <span className="text-ink/50"> (optional)</span>}
      </span>
    </label>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-500/15 px-4 py-3 text-[15px] text-red-200">
      {children}
    </p>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-ink/70" role="status">
      <span className="size-8 animate-spin rounded-full border-4 border-ink/20 border-t-brand" />
      <span>{label}</span>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[15px] font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-2 block text-sm text-ink/60">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-ink/20 bg-black/25 px-4 py-4 text-lg text-ink placeholder:text-ink/35 focus:border-brand focus:outline-none";
