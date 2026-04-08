import {
  extractTrailingTerminalContexts,
  type ParsedTerminalContextEntry,
} from "~/lib/terminalContext";

import { extractTrailingFileReferences } from "./serialization";
import type { DisplayedFileReference } from "./types";

export interface DisplayedUserMessageStateWithCustomContent {
  visibleText: string;
  copyText: string;
  contextCount: number;
  previewTitle: string | null;
  contexts: ParsedTerminalContextEntry[];
  fileReferences: DisplayedFileReference[];
}

function buildParsedTerminalContextBlock(
  contexts: ReadonlyArray<ParsedTerminalContextEntry>,
): string {
  if (contexts.length === 0) {
    return "";
  }

  const lines: string[] = ["<terminal_context>"];
  contexts.forEach((context, index) => {
    lines.push(`- ${context.header}:`);
    if (context.body.length > 0) {
      lines.push(...context.body.split("\n").map((line) => `  ${line}`));
    }
    if (index < contexts.length - 1) {
      lines.push("");
    }
  });
  lines.push("</terminal_context>");
  return lines.join("\n");
}

export function deriveDisplayedUserMessageStateWithCustomContent(
  prompt: string,
): DisplayedUserMessageStateWithCustomContent {
  const extractedContexts = extractTrailingTerminalContexts(prompt);
  const extractedFileReferences = extractTrailingFileReferences(extractedContexts.promptText);
  const terminalContextBlock = buildParsedTerminalContextBlock(extractedContexts.contexts);
  const copyText =
    terminalContextBlock.length > 0
      ? [extractedFileReferences.copyText, terminalContextBlock]
          .filter((part) => part.length > 0)
          .join("\n\n")
      : extractedFileReferences.copyText;
  return {
    visibleText: extractedFileReferences.promptText,
    copyText,
    contextCount: extractedContexts.contextCount,
    previewTitle: extractedContexts.previewTitle,
    contexts: extractedContexts.contexts,
    fileReferences: extractedFileReferences.fileReferences,
  };
}
