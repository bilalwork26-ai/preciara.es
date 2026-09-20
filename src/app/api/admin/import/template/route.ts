import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/server/admin/auth";
import { CSV_COLUMNS } from "@/server/importer/validate";

/**
 * Plantilla CSV descargable desde el panel: solo la cabecera, sin filas de
 * ejemplo (para no confundirla con datos reales). Protegida igual que
 * `/api/admin/import` — defensa en profundidad además de `proxy.ts`.
 */
export async function GET(request: NextRequest) {
  if (!verifySessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const csv = `${CSV_COLUMNS.join(",")}\n`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-ofertas-preciara.csv"',
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
