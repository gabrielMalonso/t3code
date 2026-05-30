import type { DiagnosticLogEntry } from "./types";

type ErrorDiagnosticDetails = {
  name: string | null;
  message: string;
  stack: string | null;
};

export function makeDiagnostic(
  scope: DiagnosticLogEntry["scope"],
  level: DiagnosticLogEntry["level"],
  step: string,
  message: string,
  details?: Record<string, unknown>,
): DiagnosticLogEntry {
  const entry: DiagnosticLogEntry = {
    at: new Date().toISOString(),
    scope,
    level,
    step,
    message,
  };

  const normalized = normalizeDetails(details);
  if (normalized) entry.details = normalized;

  return entry;
}

export function errorDiagnostic(
  scope: DiagnosticLogEntry["scope"],
  step: string,
  error: unknown,
  details?: Record<string, unknown>,
): DiagnosticLogEntry {
  const base = errorDetails(error);
  return makeDiagnostic(scope, "error", step, base.message, { ...details, ...base });
}

export function logDiagnostic(entry: DiagnosticLogEntry): void {
  if (entry.level === "info") return;

  const method = entry.level === "error" ? console.error : console.warn;
  method("[Annotations]", entry.step, entry.message, entry.details ?? {});
}

export function appendDiagnostic(
  entries: DiagnosticLogEntry[],
  entry: DiagnosticLogEntry,
): DiagnosticLogEntry[] {
  logDiagnostic(entry);
  return [...entries, entry];
}

export function formatDiagnostics(entries: DiagnosticLogEntry[] | undefined): string {
  if (!entries || entries.length === 0) return "";

  return entries
    .map((entry) => {
      const details = entry.details ? ` ${JSON.stringify(entry.details)}` : "";
      return `[${entry.at}] ${entry.scope}/${entry.level}/${entry.step}: ${entry.message}${details}`;
    })
    .join("\n");
}

export function formatFallbackText(
  markdownPrompt: string,
  diagnostics?: DiagnosticLogEntry[],
): string {
  const report = formatDiagnostics(diagnostics);
  if (!report) return markdownPrompt;
  return `${markdownPrompt}\n\n---\nAnnotations diagnostics:\n${report}`;
}

export function errorDetails(error: unknown): ErrorDiagnosticDetails {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    name: null,
    message: String(error ?? "unknown error"),
    stack: null,
  };
}

function normalizeDetails(
  details?: Record<string, unknown>,
): Record<string, string | number | boolean | null> | undefined {
  if (!details) return undefined;

  const normalized: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(details)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      normalized[key] = value;
      continue;
    }

    if (value === undefined) continue;
    normalized[key] = safeStringify(value);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
