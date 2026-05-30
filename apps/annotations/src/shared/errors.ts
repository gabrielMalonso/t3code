import type { CaptureFailureReason } from "./types";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toCaptureFailureReason(error: unknown): CaptureFailureReason {
  const message = errorMessage(error ?? "");

  if (/restricted|cannot access|chrome:\/\//i.test(message)) return "restricted-page";
  if (/clipboard|permission denied|notallowed/i.test(message)) return "clipboard-blocked";
  if (/download/i.test(message)) return "download-failed";
  if (/offscreen/i.test(message)) return "offscreen-unavailable";
  if (/render|canvas|image/i.test(message)) return "render-failed";
  if (/capture/i.test(message)) return "capture-failed";

  return "unknown";
}

export function captureFailureLabel(reason: CaptureFailureReason): string {
  switch (reason) {
    case "capture-failed":
      return "A captura da aba falhou.";
    case "render-failed":
      return "A montagem do PNG falhou.";
    case "download-failed":
      return "O download do PNG falhou.";
    case "clipboard-blocked":
      return "O Chrome bloqueou a cópia para o clipboard.";
    case "restricted-page":
      return "Esta página não permite injeção de extensões.";
    case "offscreen-unavailable":
      return "O documento offscreen da extensão não ficou disponível.";
    case "unknown":
      return "Erro desconhecido.";
  }
}
