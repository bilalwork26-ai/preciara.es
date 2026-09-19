import { ArrowDown } from "lucide-react";

export function DiscountBadge({ percent }: { percent: number }) {
  if (percent <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-coral-100 px-2.5 py-1 text-sm font-semibold text-coral-600">
      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
      {percent}%
    </span>
  );
}
