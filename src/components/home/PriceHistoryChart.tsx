import type { PricePoint } from "@/types";
import { formatPrice } from "@/lib/format";

const WIDTH = 480;
const HEIGHT = 200;
const PADDING = 24;

export function PriceHistoryChart({ points }: { points: PricePoint[] }) {
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const stepX = (WIDTH - PADDING * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = PADDING + i * stepX;
    const y = PADDING + (1 - (p.price - min) / range) * (HEIGHT - PADDING * 2);
    return { x, y, point: p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${HEIGHT - PADDING} L ${coords[0].x} ${HEIGHT - PADDING} Z`;
  const last = coords[coords.length - 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={`Evolución del precio, de ${formatPrice(max)} a ${formatPrice(min)}`}
      >
        <defs>
          <linearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-teal-500)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--color-teal-500)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#priceArea)" />
        <path d={linePath} fill="none" stroke="var(--color-teal-600)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 4 : 3} fill="var(--color-teal-600)" />
        ))}
      </svg>

      <div className="mt-1 flex justify-between text-xs text-navy-300">
        {points.map((p) => (
          <span key={p.label}>{p.label}</span>
        ))}
      </div>

      <p className="sr-only">
        Último precio registrado: {formatPrice(last.point.price)} el {last.point.label}.
      </p>
    </div>
  );
}
