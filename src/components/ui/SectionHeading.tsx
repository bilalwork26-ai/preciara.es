import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function SectionHeading({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-navy-900">
        <Icon className="h-5 w-5 text-teal-600" aria-hidden="true" strokeWidth={1.75} />
        {title}
      </h2>
      {action}
    </div>
  );
}
