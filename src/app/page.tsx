import { Hero } from "@/components/home/Hero";
import { VerifiedDrops } from "@/components/home/VerifiedDrops";
import { PriceHistoryCard } from "@/components/home/PriceHistoryCard";
import { StoreComparison } from "@/components/home/StoreComparison";
import { TrustIndicators } from "@/components/home/TrustIndicators";
import { AffiliateNotice } from "@/components/home/AffiliateNotice";
import { Container } from "@/components/ui/Container";

export default function Home() {
  return (
    <>
      <Hero />

      <Container className="py-10">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <section id="bajadas-verificadas" className="scroll-mt-24">
            <VerifiedDrops />
          </section>
          <section id="historial-de-precios" className="scroll-mt-24">
            <PriceHistoryCard />
          </section>
          <section id="comparar-tiendas" className="scroll-mt-24">
            <StoreComparison />
          </section>
        </div>

        <div className="mt-6">
          <AffiliateNotice />
        </div>

        <TrustIndicators />
      </Container>
    </>
  );
}
