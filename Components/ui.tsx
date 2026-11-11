'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const inputCls =
  'h-12 w-full rounded-xl border border-white/10 bg-transparent px-4 text-sm text-white outline-none transition-colors duration-200 placeholder:text-neutral-600 focus:border-white/40';

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-xs text-neutral-500">{children}</span>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'quiet';
};

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors duration-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40';
  const styles = {
    primary: 'bg-white text-black hover:bg-neutral-200',
    ghost: 'border border-white/15 text-neutral-100 hover:bg-white/5',
    quiet: 'px-2 text-neutral-400 hover:text-white',
  }[variant];
  return <button type={type} className={cx(base, styles, className)} {...props} />;
}

export function Progress({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="h-px w-full bg-white/10"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div
        className="h-px bg-white transition-[width] duration-700 ease-out"
        style={{ width: pct + '%' }}
      />
    </div>
  );
}
