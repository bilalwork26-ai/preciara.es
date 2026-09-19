import type { PricePoint } from "@/types";

/** Mini gráfico de tendencia, sin ejes: para insertar dentro de tarjetas y banners. */
export function MiniSparkline({
  points,
  className,
  stroke = "var(--color-teal-600)",
}: {
  points: PricePoint[];
  className?: string;
  stroke?: string;
}) {
  const WIDTH = 120;
  const HEIGHT = 40;
  const PAD = 4;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const stepX = (WIDTH - PAD * 2) / (points.length - 1 || 1);

  const coords = points.map((p, i) => ({
    x: PAD + i * stepX,
    y: PAD + (1 - (p.price - min) / range) * (HEIGHT - PAD * 2),
  }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const last = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={className} role="presentation" aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {last && <circle cx={last.x} cy={last.y} r="2.5" fill={stroke} />}
    </svg>
  );
}
