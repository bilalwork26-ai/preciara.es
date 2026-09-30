import { describe, expect, it } from "vitest";
import { hasFavorite, toFavoriteProduct, upsertFavorite, withoutFavorite, type FavoriteProduct } from "./favorites";
import { formatProductDisplayName } from "@/lib/format";
import type { Merchant, Product } from "@/types";

function fakeFavorite(overrides: Partial<FavoriteProduct> & { slug: string }): FavoriteProduct {
  return {
    slug: overrides.slug,
    name: overrides.name ?? `Producto ${overrides.slug}`,
    imageUrl: overrides.imageUrl ?? null,
    icon: overrides.icon ?? "Package",
    price: overrides.price ?? 10,
    merchantName: overrides.merchantName ?? "Tienda de prueba",
    savedAt: overrides.savedAt ?? 0,
  };
}

describe("lógica pura de la lista de favoritos (sin localStorage/DOM)", () => {
  describe("upsertFavorite", () => {
    it("añade un producto nuevo al principio (más reciente primero)", () => {
      const a = fakeFavorite({ slug: "a" });
      const b = fakeFavorite({ slug: "b" });
      const result = upsertFavorite([a], b);
      expect(result.map((f) => f.slug)).toEqual(["b", "a"]);
    });

    it("con un slug ya presente, lo mueve al principio con los datos nuevos en vez de duplicarlo", () => {
      const a = fakeFavorite({ slug: "a", price: 10 });
      const b = fakeFavorite({ slug: "b" });
      const aActualizado = fakeFavorite({ slug: "a", price: 20 });
      const result = upsertFavorite([a, b], aActualizado);
      expect(result.map((f) => f.slug)).toEqual(["a", "b"]);
      expect(result[0].price).toBe(20);
    });

    it("con una lista vacía, el resultado es solo el producto añadido", () => {
      const a = fakeFavorite({ slug: "a" });
      expect(upsertFavorite([], a)).toEqual([a]);
    });
  });

  describe("withoutFavorite", () => {
    it("quita solo el slug indicado, conserva el resto en su orden", () => {
      const a = fakeFavorite({ slug: "a" });
      const b = fakeFavorite({ slug: "b" });
      const c = fakeFavorite({ slug: "c" });
      expect(withoutFavorite([a, b, c], "b").map((f) => f.slug)).toEqual(["a", "c"]);
    });

    it("con un slug que no existe en la lista, no cambia nada", () => {
      const a = fakeFavorite({ slug: "a" });
      expect(withoutFavorite([a], "no-existe")).toEqual([a]);
    });

    it("con una lista vacía, devuelve una lista vacía sin lanzar", () => {
      expect(withoutFavorite([], "a")).toEqual([]);
    });
  });

  describe("hasFavorite", () => {
    it("true si el slug está presente, false si no", () => {
      const a = fakeFavorite({ slug: "a" });
      expect(hasFavorite([a], "a")).toBe(true);
      expect(hasFavorite([a], "b")).toBe(false);
      expect(hasFavorite([], "a")).toBe(false);
    });
  });
});

describe("toFavoriteProduct", () => {
  function fakeProduct(overrides: Partial<Product> = {}): Product {
    return {
      id: "p1",
      slug: "producto-1",
      name: "Zapatilla Ultraboost",
      categoryId: "c1",
      icon: "Shirt",
      imageUrl: "https://example.invalid/foto.jpg",
      brand: null,
      priceHistory: [],
      offers: [
        { id: "o1", merchantId: "m1", price: 59.99, currency: "EUR", url: "https://example.invalid/p1", inStock: true, verified: true, lastCheckedLabel: "hoy" },
        { id: "o2", merchantId: "m2", price: 49.99, currency: "EUR", url: "https://example.invalid/p1b", inStock: true, verified: true, lastCheckedLabel: "hoy" },
      ],
      ...overrides,
    };
  }
  const merchants: Merchant[] = [
    { id: "m1", slug: "tienda-a", name: "Tienda A", accentColor: "#000" },
    { id: "m2", slug: "tienda-b", name: "Tienda B", accentColor: "#111" },
  ];

  it("toma el precio y la tienda de la oferta MÁS BARATA, no de la primera del array", () => {
    const fav = toFavoriteProduct(fakeProduct(), merchants);
    expect(fav.price).toBe(49.99);
    expect(fav.merchantName).toBe("Tienda B");
  });

  it("copia slug/icon/imageUrl tal cual, y calcula name delegando en formatProductDisplayName (mismo criterio que el resto de tarjetas)", () => {
    const fav = toFavoriteProduct(fakeProduct({ name: "adidas Zapatilla Ultraboost", brand: "adidas" }), merchants);
    expect(fav.slug).toBe("producto-1");
    expect(fav.icon).toBe("Shirt");
    expect(fav.imageUrl).toBe("https://example.invalid/foto.jpg");
    expect(fav.name).toBe(formatProductDisplayName("adidas Zapatilla Ultraboost", "adidas"));
  });

  it("sin imageUrl, guarda null (nunca undefined, para que sobreviva serializado en JSON/localStorage)", () => {
    const fav = toFavoriteProduct(fakeProduct({ imageUrl: undefined }), merchants);
    expect(fav.imageUrl).toBeNull();
  });
});

describe("API pública sin `window` (renderizado en servidor): nunca lanza", () => {
  it("getFavoritesSnapshot/isFavoriteSlug/toggleFavorite/removeFavorite no lanzan sin window", async () => {
    const mod = await import("./favorites");
    const slug = "ssr-safety-check-1";
    expect(mod.isFavoriteSlug(slug)).toBe(false);
    expect(() => mod.getFavoritesSnapshot()).not.toThrow();
    expect(() => mod.toggleFavorite(fakeFavorite({ slug }))).not.toThrow();
    expect(() => mod.removeFavorite(slug)).not.toThrow();
  });

  it("toggleFavorite sigue guardando/quitando en la caché en memoria aunque no haya window (persiste solo para esta sesión de proceso, nunca lanza)", async () => {
    const mod = await import("./favorites");
    const slug = "ssr-safety-check-2";
    expect(mod.isFavoriteSlug(slug)).toBe(false);
    const savedNow = mod.toggleFavorite(fakeFavorite({ slug }));
    expect(savedNow).toBe(true);
    expect(mod.isFavoriteSlug(slug)).toBe(true);
    const savedAfter = mod.toggleFavorite(fakeFavorite({ slug }));
    expect(savedAfter).toBe(false);
    expect(mod.isFavoriteSlug(slug)).toBe(false);
  });

  it("getFavoritesServerSnapshot devuelve siempre una lista vacía (snapshot de servidor para useSyncExternalStore, evita desajustes de hidratación)", async () => {
    const { getFavoritesServerSnapshot } = await import("./favorites");
    expect(getFavoritesServerSnapshot()).toEqual([]);
  });

  it("getFavoritesServerSnapshot devuelve SIEMPRE la misma referencia (useSyncExternalStore exige un snapshot estable; un array nuevo en cada llamada provoca el aviso/bucle 'getServerSnapshot should be cached')", async () => {
    const { getFavoritesServerSnapshot } = await import("./favorites");
    expect(getFavoritesServerSnapshot()).toBe(getFavoritesServerSnapshot());
  });

  it("subscribeFavorites: el listener se llama al cambiar el estado, y deja de llamarse tras cancelar la suscripción", async () => {
    const mod = await import("./favorites");
    const slug = "ssr-safety-check-3";
    let calls = 0;
    const unsubscribe = mod.subscribeFavorites(() => {
      calls++;
    });
    mod.toggleFavorite(fakeFavorite({ slug }));
    expect(calls).toBe(1);
    unsubscribe();
    mod.toggleFavorite(fakeFavorite({ slug }));
    expect(calls).toBe(1); // ya no se le avisa tras cancelar
  });
});
