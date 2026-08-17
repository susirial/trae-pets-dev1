export const OFFICIAL_WEBSITE_URL = 'https://www.trae-pets.com/';

/** Offered when hook auto-install cannot find a supported system Node runtime. */
export const NODE_DOWNLOAD_URL = 'https://nodejs.org/en/download';

const ALLOWED_EXTERNAL_ORIGINS = new Set([
  new URL(OFFICIAL_WEBSITE_URL).origin,
  new URL(NODE_DOWNLOAD_URL).origin,
]);

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_EXTERNAL_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}
