const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const PHONE_RE = /\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}\b/g;
const LONG_TOKEN_RE = /\b[A-Za-z0-9_-]{24,}\b/g;
const LONG_NUMBER_RE = /\b\d{8,}\b/g;
const SENSITIVE_QUERY_RE =
  /([?&](?:token|access_token|refresh_token|key|api_key|secret|password|pass|auth|session|sid)=)[^&#]+/gi;
const REDACTED_QUERY_VALUE = "<redacted>";

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "key",
  "api_key",
  "secret",
  "password",
  "pass",
  "auth",
  "session",
  "sid",
]);

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function truncateText(value: string, maxLength = 240): string {
  const clean = collapseWhitespace(value);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(EMAIL_RE, "[email]")
    .replace(CNPJ_RE, "[cnpj]")
    .replace(CPF_RE, "[cpf]")
    .replace(PHONE_RE, "[telefone]")
    .replace(SENSITIVE_QUERY_RE, `$1${REDACTED_QUERY_VALUE}`)
    .replace(LONG_TOKEN_RE, "[token]")
    .replace(LONG_NUMBER_RE, "[numero]");
}

export function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    const entries = Array.from(url.searchParams.entries());
    url.search = "";

    for (const [key, paramValue] of entries) {
      if (shouldRedactQueryParam(key, paramValue)) {
        url.searchParams.append(key, REDACTED_QUERY_VALUE);
      } else {
        url.searchParams.append(key, paramValue);
      }
    }

    return url.toString().replaceAll("%3Credacted%3E", REDACTED_QUERY_VALUE);
  } catch {
    return value.replace(SENSITIVE_QUERY_RE, `$1${REDACTED_QUERY_VALUE}`);
  }
}

export function redactAndTruncate(value: string, maxLength = 240): string {
  return truncateText(redactSensitiveText(value), maxLength);
}

function shouldRedactQueryParam(key: string, value: string): boolean {
  const normalizedKey = key.toLowerCase();
  if (SENSITIVE_QUERY_KEYS.has(normalizedKey)) return true;
  if (normalizedKey.endsWith("id") && value.length >= 12) return true;
  if (LONG_TOKEN_RE.test(value)) {
    LONG_TOKEN_RE.lastIndex = 0;
    return true;
  }
  LONG_TOKEN_RE.lastIndex = 0;
  if (LONG_NUMBER_RE.test(value)) {
    LONG_NUMBER_RE.lastIndex = 0;
    return true;
  }
  LONG_NUMBER_RE.lastIndex = 0;
  return false;
}
