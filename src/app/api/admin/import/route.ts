import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/server/admin/auth";
import { runCsvImport, ImportSetupError, MAX_CSV_BYTES } from "@/server/importer/run";

/**
 * Importación de ofertas desde un CSV subido por el panel técnico.
 * `proxy.ts` ya protege esta ruta (`/api/admin/:path*`); se repite la
 * comprobación de sesión aquí como defensa en profundidad.
 */
export async function POST(request: NextRequest) {
  if (!verifySessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario." }, { status: 400 });
  }

  const file = formData.get("file");
  const dryRun = formData.get("dryRun") === "true";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el fichero CSV." }, { status: 400 });
  }
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: `El fichero supera el límite de ${Math.round(MAX_CSV_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
  }

  // El nombre del fichero es solo una etiqueta informativa para ImportRun.source:
  // nunca se usa para decidir cómo se procesa el contenido (ver validate.ts).
  const safeFileName = file.name.replace(/[^\w.\- ]/g, "").slice(0, 80) || "sin-nombre.csv";
  const csvContent = await file.text();

  try {
    const summary = await runCsvImport({
      csvContent,
      source: `csv:admin-upload:${safeFileName}`,
      dryRun,
      metadata: { uploadedFileName: safeFileName },
    });
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof ImportSetupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[admin import] Error inesperado procesando la subida:", error);
    return NextResponse.json({ error: "Error inesperado al importar. Se ha registrado en el servidor." }, { status: 500 });
  }
}
