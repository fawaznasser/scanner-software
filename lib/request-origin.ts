/** The configured HTTPS origin is authoritative behind a reverse proxy.
 * Forwarded/Host headers never select a trusted write origin or redirect target.
 */
export function requestOrigin(request: Request) {
  const configured = process.env.DMS_PUBLIC_ORIGIN;
  if (!configured) return new URL(request.url).origin;
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("DMS_PUBLIC_ORIGIN must be an HTTPS origin without a path or credentials.");
  return url.origin;
}

export function isAllowedRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return request.headers.get("sec-fetch-site") !== "cross-site" && (!origin || origin === requestOrigin(request));
}
