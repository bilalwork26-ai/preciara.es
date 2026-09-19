import { TrustStrip } from "@/components/home/TrustStrip";
import { PromoBannerMain } from "@/components/home/PromoBannerMain";
import { PromoBannerSecondary } from "@/components/home/PromoBannerSecondary";
import { CategoryRow } from "@/components/home/CategoryRow";
import { VerifiedDealsGrid } from "@/components/home/VerifiedDealsGrid";
import { ComparisonPanel } from "@/components/home/ComparisonPanel";
import { Container } from "@/components/ui/Container";

export default function Home() {
  return (
    <>
      <TrustStrip />

      <Container className="pb-8 pt-6 sm:pt-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
          <PromoBannerMain />
          <PromoBannerSecondary />
        </div>

        <div id="categorias" className="mt-6 scroll-mt-24">
          <CategoryRow />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <VerifiedDealsGrid />
          <ComparisonPanel />
        </div>
      </Container>
    </>
  );
}
