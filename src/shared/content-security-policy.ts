export function contentSecurityPolicy(production: boolean): string {
  const connectSrc = production
    ? "connect-src 'none'"
    : "connect-src 'self' http://localhost:* ws://localhost:*";
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: trae-pet:",
    "media-src 'self' data: blob: trae-pet:",
    "font-src 'self' data:",
    connectSrc,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "form-action 'none'",
  ].join('; ');
}
