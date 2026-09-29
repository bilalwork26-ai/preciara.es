/**
 * Imagen de Open Graph/Twitter por defecto para todo el sitio: una
 * tarjeta de marca generada en el propio build (`ImageResponse` de
 * `next/og`, motor Satori/resvg), nunca una foto de producto inventada.
 * Se usa como `openGraph.images`/`twitter.images` en cualquier página que
 * no tenga una foto real propia que mostrar (ver `DEFAULT_OG_IMAGE_PATH`
 * en `src/lib/seo.ts`) — la ficha de producto usa en su lugar la imagen
 * real del producto cuando existe.
 *
 * Sin fuentes personalizadas a propósito: Satori solo admite
 * ttf/otf/woff (nunca woff2, el único formato que el proyecto tiene
 * autoalojado para Fraunces/Plus Jakarta Sans — ver layout.tsx), y cargar
 * un fichero de fuente adicional aquí repetiría el mismo riesgo de build
 * que ya causó una compilación rota en Hostinger con `next/font/google`
 * (ver el comentario de layout.tsx). La familia de letra del sistema es
 * suficiente para una tarjeta de marca simple.
 *
 * `runtime = "nodejs"` explícito: igual que `api/jobs/awin-sync`, Hostinger
 * sirve la app como Node.js normal, no como Edge Runtime de Vercel.
 */
import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#071a33",
          backgroundImage: "linear-gradient(135deg, #071a33 0%, #0a2547 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 88,
            height: 88,
            borderRadius: 24,
            backgroundColor: "#087f78",
            marginBottom: 40,
          }}
        >
          <span style={{ fontSize: 44, fontWeight: 700, color: "#ffffff" }}>P</span>
        </div>
        <span style={{ fontSize: 72, fontWeight: 700, color: "#ffffff", letterSpacing: -1 }}>Preciara</span>
        <span style={{ marginTop: 20, fontSize: 34, color: "#efe9db", maxWidth: 900 }}>
          Precios claros. Compras inteligentes.
        </span>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
