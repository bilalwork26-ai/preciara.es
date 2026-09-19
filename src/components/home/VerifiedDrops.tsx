import Link from "next/link";
import { Tags, ArrowRight, BadgeCheck } from "lucide-react";
import { demoProducts } from "@/data/demo/products";
import { formatPrice, calcDiscountPercent } from "@/lib/format";
import { ProductGlyph } from "@/components/ui/ProductGlyph";
import { DiscountBadge } from "@/components/ui/DiscountBadge";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function VerifiedDrops() {
  const drops = demoProducts
    .map((product) => {
      const offer = product.offers.find((o) => o.previousPrice && o.verified);
      if (!offer || !offer.previousPrice) return null;
      return {
        product,
        offer,
        percent: calcDiscountPercent(offer.price, offer.previousPrice),
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-white p-5 shadow-sm">
      <SectionHeading
        icon={Tags}
        title="Bajadas verificadas"
        action={
          <Link
            href="/buscar"
            className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            Ver todas
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />
      <p className="mt-1 text-sm text-navy-500">
        Productos que han bajado de precio recientemente
      </p>

      <ul className="mt-4 flex flex-1 flex-col gap-3">
        {drops.map(({ product, offer, percent }) => (
          <li key={product.id} className="flex items-center gap-3">
            <ProductGlyph icon={product.icon} className="h-12 w-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-navy-900">{product.name}</p>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-sm font-semibold text-navy-900">
                  {formatPrice(offer.price)}
                </span>
                {offer.previousPrice && (
                  <span className="text-xs text-navy-300 line-through">
                    {formatPrice(offer.previousPrice)}
                  </span>
                )}
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-navy-300">
                <BadgeCheck className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                Verificado · Actualizado {offer.lastCheckedLabel}
              </p>
            </div>
            <DiscountBadge percent={percent} />
          </li>
        ))}
      </ul>
    </div>
  );
}
