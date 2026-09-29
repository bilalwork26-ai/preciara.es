import { describe, expect, it } from "vitest";
import {
  buildAboutPageJsonLd,
  buildBreadcrumbList,
  buildContactPageJsonLd,
  buildProductJsonLd,
  buildWebPageJsonLd,
  SITE_URL,
} from "./seo";
import type { Merchant, Product } from "@/types";

describe("buildBreadcrumbList", () => {
  it("construye posiciones 1-indexadas con URLs absolutas bajo SITE_URL", () => {
    const jsonLd = buildBreadcrumbList([
      { name: "Inicio", path: "/" },
      { name: "Tecnología", path: "/categoria/tecnologia" },
    ]);
    expect(jsonLd["@type"]).toBe("BreadcrumbList");
    expect(jsonLd.itemListElement[0]).toMatchObject({ position: 1, name: "Inicio", item: `${SITE_URL}/` });
    expect(jsonLd.itemListElement[1]).toMatchObject({
      position: 2,
      name: "Tecnología",
      item: `${SITE_URL}/categoria/tecnologia`,
    });
  });
});

describe("buildProductJsonLd", () => {
  const merchants: Merchant[] = [{ id: "m1", slug: "m1", name: "Tienda Uno", accentColor: "#000" }];

  it("usa Offer (no AggregateOffer) cuando solo hay una oferta", () => {
    const product: Product = {
      id: "p1",
      slug: "producto-uno",
      name: "Producto Uno",
      categoryId: "cat",
      icon: "Tag",
      priceHistory: [],
      offers: [{ id: "o1", merchantId: "m1", price: 10, currency: "EUR", url: "https://example.invalid/o1", inStock: true, verified: false, lastCheckedLabel: "hace 1 min" }],
    };
    const jsonLd = buildProductJsonLd(product, merchants, "/producto/producto-uno");
    expect(jsonLd.offers).toMatchObject({ "@type": "Offer", price: 10, priceCurrency: "EUR" });
  });

  it("usa AggregateOffer con lowPrice/highPrice/offerCount cuando hay varias ofertas", () => {
    const product: Product = {
      id: "p2",
      slug: "producto-dos",
      name: "Producto Dos",
      categoryId: "cat",
      icon: "Tag",
      priceHistory: [],
      offers: [
        { id: "o1", merchantId: "m1", price: 10, currency: "EUR", url: "#", inStock: true, verified: false, lastCheckedLabel: "x" },
        { id: "o2", merchantId: "m1", price: 15, currency: "EUR", url: "#", inStock: true, verified: false, lastCheckedLabel: "x" },
      ],
    };
    const jsonLd = buildProductJsonLd(product, merchants, "/producto/producto-dos");
    expect(jsonLd.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: 10, highPrice: 15, offerCount: 2 });
  });

  it("incluye image cuando el producto tiene una foto real (imageUrl)", () => {
    const product: Product = {
      id: "p4",
      slug: "producto-cuatro",
      name: "Producto Cuatro",
      categoryId: "cat",
      icon: "Tag",
      imageUrl: "https://merchant.example.invalid/foto.jpg",
      priceHistory: [],
      offers: [{ id: "o1", merchantId: "m1", price: 10, currency: "EUR", url: "#", inStock: true, verified: false, lastCheckedLabel: "x" }],
    };
    const jsonLd = buildProductJsonLd(product, merchants, "/producto/producto-cuatro");
    expect(jsonLd.image).toBe("https://merchant.example.invalid/foto.jpg");
  });

  it("nunca inventa image cuando el producto no tiene ninguna foto real", () => {
    const product: Product = {
      id: "p5",
      slug: "producto-cinco",
      name: "Producto Cinco",
      categoryId: "cat",
      icon: "Tag",
      imageUrl: null,
      priceHistory: [],
      offers: [{ id: "o1", merchantId: "m1", price: 10, currency: "EUR", url: "#", inStock: true, verified: false, lastCheckedLabel: "x" }],
    };
    const jsonLd = buildProductJsonLd(product, merchants, "/producto/producto-cinco");
    expect(jsonLd).not.toHaveProperty("image");
  });

  it("nunca incluye campos inventados como aggregateRating o brand", () => {
    const product: Product = {
      id: "p3",
      slug: "producto-tres",
      name: "Producto Tres",
      categoryId: "cat",
      icon: "Tag",
      priceHistory: [],
      offers: [{ id: "o1", merchantId: "m1", price: 10, currency: "EUR", url: "#", inStock: true, verified: false, lastCheckedLabel: "x" }],
    };
    const jsonLd = buildProductJsonLd(product, merchants, "/producto/producto-tres");
    expect(jsonLd).not.toHaveProperty("aggregateRating");
    expect(jsonLd).not.toHaveProperty("review");
    expect(jsonLd).not.toHaveProperty("brand");
  });
});

describe("buildAboutPageJsonLd", () => {
  it("construye un AboutPage con la URL absoluta correcta", () => {
    const jsonLd = buildAboutPageJsonLd({ name: "Sobre Preciara", description: "..." }, "/sobre-preciara");
    expect(jsonLd["@type"]).toBe("AboutPage");
    expect(jsonLd.url).toBe(`${SITE_URL}/sobre-preciara`);
    expect(jsonLd.about).toMatchObject({ "@type": "Organization", name: "Preciara" });
  });
});

describe("buildWebPageJsonLd", () => {
  it("construye un WebPage simple con la URL absoluta correcta", () => {
    const jsonLd = buildWebPageJsonLd({ name: "Para tiendas", description: "..." }, "/para-tiendas");
    expect(jsonLd["@type"]).toBe("WebPage");
    expect(jsonLd.url).toBe(`${SITE_URL}/para-tiendas`);
  });
});

describe("buildContactPageJsonLd", () => {
  it("incluye mainEntity con el correo cuando se proporciona uno real", () => {
    const jsonLd = buildContactPageJsonLd(
      { name: "Contacto", description: "...", email: "contacto@preciara.es" },
      "/contacto",
    );
    expect(jsonLd["@type"]).toBe("ContactPage");
    expect(jsonLd.url).toBe(`${SITE_URL}/contacto`);
    expect(jsonLd).toHaveProperty("mainEntity");
    expect(jsonLd.mainEntity).toMatchObject({ "@type": "Organization", email: "contacto@preciara.es" });
  });

  it("nunca inventa un correo: sin email real, no incluye mainEntity en absoluto", () => {
    const jsonLd = buildContactPageJsonLd({ name: "Contacto", description: "...", email: null }, "/contacto");
    expect(jsonLd).not.toHaveProperty("mainEntity");
  });
});
