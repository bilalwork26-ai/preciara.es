import type { ReactNode } from "react";

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-300">{label}</p>
      <p className="mt-1 font-serif text-2xl font-bold text-navy-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-navy-500">{hint}</p>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "ok" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const classes = {
    ok: "bg-teal-50 text-teal-700",
    warn: "bg-coral-50 text-coral-600",
    bad: "bg-coral-100 text-coral-600",
    neutral: "bg-beige text-navy-500",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${classes}`}>{children}</span>;
}
