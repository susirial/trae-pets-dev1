export interface KeyboardInput {
  key: string;
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

function navigationIdentity(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function isAllowedPageNavigation(allowedUrl: string, targetUrl: string): boolean {
  const allowed = navigationIdentity(allowedUrl);
  return allowed !== null && allowed === navigationIdentity(targetUrl);
}

export function isDevToolsShortcut(input: KeyboardInput): boolean {
  const key = input.key.toLowerCase();
  if (key === 'f12') return true;
  if (key !== 'i') return false;
  return Boolean(
    (input.shift && (input.control || input.meta))
    || (input.alt && input.meta),
  );
}

export function safeRendererPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }
  if (/^(?:pet|settings)\/index\.html$/.test(decoded)) return decoded;
  if (/^assets\/[A-Za-z0-9._-]+\.(?:js|css)$/.test(decoded)) return decoded;
  return null;
}
