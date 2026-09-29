import { ArrowDown } from "lucide-react";

export function DiscountBadge({ percent }: { percent: number }) {
  if (percent <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-coral-500 px-3 py-1.5 text-base font-bold text-white shadow-sm">
      <ArrowDown className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
      -{percent}%
    </span>
  );
}
