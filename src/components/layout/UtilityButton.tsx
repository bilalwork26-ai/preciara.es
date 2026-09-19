"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";

type UtilityButtonProps = {
  icon: LucideIcon;
  label: string;
  /** Texto informativo honesto: aún no hay funcionalidad real detrás. */
  message: string;
  withChevron?: boolean;
};

/**
 * Botón de la cabecera (Guardados, Alertas, Mi cuenta) que abre un panel
 * informativo accesible en vez de simular datos o navegación que no existe.
 */
export function UtilityButton({ icon: Icon, label, message, withChevron = false }: UtilityButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = `utility-panel-${label.toLowerCase().replace(/\s+/g, "-")}`;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-ivory transition-colors hover:bg-white/10"
      >
        <span className="flex items-center gap-1">
          <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
          {withChevron && <ChevronDown className="h-3 w-3" aria-hidden="true" />}
        </span>
        <span className="text-[11px] font-medium leading-none">{label}</span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-border bg-white p-4 text-navy-900 shadow-lg"
        >
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{message}</p>
        </div>
      )}
    </div>
  );
}
