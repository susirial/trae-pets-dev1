const SECRET_PATTERNS: RegExp[] = [
  /(authorization\s*:\s*bearer\s+)[^\s"'`]+/gi,
  /((?:api[_-]?key|token|secret|password|passwd|pwd)\s*[=:]\s*)[^\s"'`&]+/gi,
  /\b(sk-[A-Za-z0-9_-]{12,})\b/g,
  /\b(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
];

const SENSITIVE_OPTION_PATTERN =
  /^--?(?:api[_-]?key|token|secret|password|passwd|pwd|authorization|auth)$/i;

export function redactSecrets(text: unknown): string {
  let output = String(text ?? '');
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (_match, prefix?: string) => (prefix ? `${prefix}***` : '***'));
  }
  return output;
}

export function compactText(text: unknown, maxLength = 84): string {
  const normalized = redactSecrets(text).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}...`;
}

function tokenizeCommand(text: string): string[] {
  return text.match(/"[^"]*"|'[^']*'|`[^`]*`|[^\s]+/g) ?? [];
}

function sanitizeCommandTokens(tokens: string[]): string[] {
  const sanitized: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = redactSecrets(tokens[index]);
    const inlineAssignment = token.match(
      /^((?:--?)(?:api[_-]?key|token|secret|password|passwd|pwd|authorization|auth))=(.+)$/i,
    );
    if (inlineAssignment) {
      sanitized.push(`${inlineAssignment[1]}=***`);
      continue;
    }

    sanitized.push(token);
    if (SENSITIVE_OPTION_PATTERN.test(token) && index + 1 < tokens.length) {
      sanitized.push('***');
      index += 1;
    }
  }
  return sanitized;
}

export function summarizeCommand(text: unknown, maxTokens = 5, maxLength = 84): string {
  const normalized = String(text ?? '').trim();
  if (!normalized) {
    return '';
  }

  const tokens = sanitizeCommandTokens(tokenizeCommand(normalized));
  if (!tokens.length) {
    return '';
  }

  const previewTokens = tokens.slice(0, Math.max(1, maxTokens));
  const hasMore = tokens.length > previewTokens.length;
  const preview = `${previewTokens.join(' ')}${hasMore ? ' ...' : ''}`;
  return compactText(preview, maxLength);
}

export function basenameOnly(filePath: unknown): string {
  return String(filePath ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';
}
