import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { computeChallengeResponse } from "@/server/ebay/challengeResponse";
import { getEbayOAuthCredentials, getMarketplaceAccountDeletionConfig } from "@/server/ebay/config";
import { validateMarketplaceAccountDeletionPayload } from "@/server/ebay/payloadValidation";
import { verifyEbaySignature, type SignatureVerificationResult } from "@/server/ebay/signatureVerification";

/**
 * Endpoint de eBay "Marketplace Account Deletion" (requisito obligatorio
 * de cumplimiento para cualquier app de eBay que use su API): valida este
 * endpoint (GET) y recibe notificaciones de baja de cuenta de usuarios de
 * eBay (POST). Ver https://developer.ebay.com/marketplace-account-deletion.
 *
 * Preciara NO almacena username, userId, eiasToken ni ningún otro dato
 * personal de usuarios de eBay: no hay nada que borrar cuando llega una de
 * estas notificaciones, así que "procesarla" consiste en verificar su
 * firma (signatureVerification.ts), comprobar mínimamente que el payload
 * es el esperado (payloadValidation.ts) y reconocerla (204) — nunca se
 * guarda, registra ni inspecciona su contenido más allá de esa comprobación.
 *
 * Nunca cacheable: eBay reintenta activamente si no recibe la respuesta
 * esperada en el formato exacto, y una respuesta cacheada por un proxy
 * intermedio podría enmascarar un fallo real de verificación o servir un
 * `challengeResponse` calculado para una petición distinta.
 */
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/**
 * GET — validación del endpoint: eBay llama con `?challenge_code=...` al
 * darlo de alta y espera `{"challengeResponse": "<sha256 hex>"}` calculado
 * sobre challengeCode + verificationToken + endpoint, en ese orden exacto.
 */
export async function GET(request: NextRequest) {
  const challengeCode = request.nextUrl.searchParams.get("challenge_code");
  if (!challengeCode) {
    return NextResponse.json({ error: 'Falta el parámetro "challenge_code".' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const config = getMarketplaceAccountDeletionConfig();
  if (!config) {
    console.error(
      "[ebay:marketplace-account-deletion] Falta configuración: EBAY_MARKETPLACE_DELETION_ENDPOINT y/o EBAY_MARKETPLACE_DELETION_VERIFICATION_TOKEN."
    );
    return NextResponse.json({ error: "Endpoint no configurado." }, { status: 500, headers: NO_STORE_HEADERS });
  }

  const challengeResponse = computeChallengeResponse(challengeCode, config.verificationToken, config.endpoint);
  return NextResponse.json({ challengeResponse }, { status: 200, headers: NO_STORE_HEADERS });
}

/**
 * POST — notificación real. Firma válida Y payload esperado (JSON válido
 * con `metadata.topic === "MARKETPLACE_ACCOUNT_DELETION"`) -> 204
 * (procesada). Cualquier otro caso — firma inválida, ausente, imposible de
 * verificar (sin credenciales OAuth configuradas, fallo al obtener la
 * clave pública de eBay...), o firma válida pero JSON inválido/topic
 * distinto -> 412 siempre. Nunca hay un tercer camino que responda
 * 200/204 sin haber verificado de verdad ambas cosas.
 */
export async function POST(request: NextRequest) {
  // Se lee el cuerpo BRUTO, sin volver a serializarlo (ni `request.json()`
  // seguido de un `JSON.stringify`): es exactamente lo que exige la firma
  // de eBay, y Preciara nunca inspecciona ni guarda el contenido de estas
  // notificaciones de todos modos.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (error) {
    console.error(
      "[ebay:marketplace-account-deletion] No se pudo leer el cuerpo de la notificación:",
      error instanceof Error ? error.message : "error desconocido"
    );
    return new NextResponse(null, { status: 412, headers: NO_STORE_HEADERS });
  }

  const signatureHeader = request.headers.get("x-ebay-signature");
  const oauthCredentials = getEbayOAuthCredentials();

  let result: SignatureVerificationResult;
  try {
    result = await verifyEbaySignature({ rawBody, signatureHeader, oauthCredentials });
  } catch (error) {
    console.error(
      "[ebay:marketplace-account-deletion] Error inesperado verificando la firma:",
      error instanceof Error ? error.message : "error desconocido"
    );
    return new NextResponse(null, { status: 412, headers: NO_STORE_HEADERS });
  }

  if (!result.verified) {
    // Solo el motivo técnico (un código corto) y, si lo hay, el status
    // HTTP devuelto por eBay — nunca la URL, cabeceras, tokens,
    // credenciales, el cuerpo de la respuesta de eBay ni el cuerpo de la
    // notificación.
    const statusSuffix = result.httpStatus !== undefined ? ` [HTTP ${result.httpStatus}]` : "";
    console.warn(`[ebay:marketplace-account-deletion] Firma no verificada (${result.reason}${statusSuffix}). Notificación rechazada.`);
    return new NextResponse(null, { status: 412, headers: NO_STORE_HEADERS });
  }

  // Firma correcta, pero eso solo prueba que el cuerpo lo emitió eBay —
  // no que sea el payload que este endpoint espera. Validación mínima
  // adicional (JSON válido + topic correcto, ver payloadValidation.ts): un
  // rechazo aquí es tan "cerrado" como uno de firma, y tampoco registra el
  // cuerpo ni ningún dato personal.
  const payloadCheck = validateMarketplaceAccountDeletionPayload(rawBody);
  if (!payloadCheck.valid) {
    console.warn(`[ebay:marketplace-account-deletion] Firma válida pero payload rechazado (${payloadCheck.reason}). Notificación rechazada.`);
    return new NextResponse(null, { status: 412, headers: NO_STORE_HEADERS });
  }

  // Firma y payload válidos: "procesar" la notificación. Preciara no
  // almacena username/userId/eiasToken ni ningún otro dato personal de
  // eBay, así que no hay nada que borrar ni persistir — solo se reconoce.
  console.info("[ebay:marketplace-account-deletion] Notificación verificada y reconocida (sin persistir datos personales).");
  return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
}
