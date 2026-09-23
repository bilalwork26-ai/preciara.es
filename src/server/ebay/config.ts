/**
 * Lectura de la configuración del endpoint de Marketplace Account Deletion
 * de eBay (ver `src/app/api/ebay/marketplace-account-deletion/route.ts`).
 * Nunca lanza por configuración ausente: cada función devuelve `null` para
 * que quien llama decida el código de estado HTTP correcto (400/500/412
 * según el caso) — y nunca imprime, registra ni expone el valor real de
 * ningún secreto.
 */

export type MarketplaceAccountDeletionConfig = {
  /** URL pública exacta configurada en el panel de desarrollador de eBay para este endpoint. */
  endpoint: string;
  /** Token de verificación compartido con eBay (32-80 caracteres, letras/números/guion/guion bajo). */
  verificationToken: string;
};

export function getMarketplaceAccountDeletionConfig(): MarketplaceAccountDeletionConfig | null {
  const endpoint = process.env.EBAY_MARKETPLACE_DELETION_ENDPOINT;
  const verificationToken = process.env.EBAY_MARKETPLACE_DELETION_VERIFICATION_TOKEN;
  if (!endpoint || !verificationToken) return null;
  return { endpoint, verificationToken };
}

export type EbayOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

/**
 * Credenciales de aplicación de eBay (App ID / Cert ID), necesarias para
 * obtener el token OAuth de tipo `client_credentials` con el que eBay
 * exige autenticar la lectura de su clave pública de notificaciones
 * (`GET /commerce/notification/v1/public_key/{kid}` — ver
 * `signatureVerification.ts`). Sin estas credenciales, el endpoint POST
 * nunca puede verificar una firma de verdad y responde 412 siempre (nunca
 * 204 sin haber verificado) — ver decisiones en el informe de la rama
 * feat/ebay-account-deletion-endpoint.
 */
export function getEbayOAuthCredentials(): EbayOAuthCredentials | null {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
