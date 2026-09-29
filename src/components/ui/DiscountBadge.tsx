import { ArrowDown } from "lucide-react";

export function DiscountBadge({ percent }: { percent: number }) {
  if (percent <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-coral-500 px-2 py-1 text-xs font-bold text-white shadow-sm sm:px-3 sm:py-1.5 sm:text-base">
      <ArrowDown className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" strokeWidth={2.5} />
      -{percent}%
    </span>
  );
}
