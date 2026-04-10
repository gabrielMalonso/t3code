import {
  INLINE_TERMINAL_CONTEXT_PLACEHOLDER,
  type TerminalContextDraft,
} from "./lib/terminalContext";

export interface ComposerPromptInlineTokenOptions {
  customTokenTexts?: readonly string[];
}

export type ComposerPromptSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "mention";
      path: string;
    }
  | {
      type: "custom-token";
      tokenText: string;
    }
  | {
      type: "terminal-context";
      context: TerminalContextDraft | null;
    };

const MENTION_TOKEN_REGEX = /(^|\s)@([^\s@]+)(?=\s)/g;

function toCustomTokenTexts(tokenTexts?: readonly string[]): readonly string[] {
  if (!tokenTexts || tokenTexts.length === 0) {
    return [];
  }
  return [...new Set(tokenTexts)].toSorted((left, right) => right.length - left.length);
}

function escapeRegexFragment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCustomTokenRegex(tokenTexts: readonly string[]): RegExp | null {
  if (tokenTexts.length === 0) {
    return null;
  }
  return new RegExp(`(^|\\s)(${tokenTexts.map(escapeRegexFragment).join("|")})(?=\\s)`, "g");
}

function rangeIncludesIndex(start: number, end: number, index: number): boolean {
  return start <= index && index < end;
}

function pushTextSegment(segments: ComposerPromptSegment[], text: string): void {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && last.type === "text") {
    last.text += text;
    return;
  }
  segments.push({ type: "text", text });
}

function forEachPromptSegmentSlice(
  prompt: string,
  visitor: (
    slice:
      | {
          type: "text";
          text: string;
          promptOffset: number;
        }
      | {
          type: "terminal-context";
          promptOffset: number;
        },
  ) => boolean | void,
): boolean {
  let textCursor = 0;

  for (let index = 0; index < prompt.length; index += 1) {
    if (prompt[index] !== INLINE_TERMINAL_CONTEXT_PLACEHOLDER) {
      continue;
    }

    if (
      index > textCursor &&
      visitor({
        type: "text",
        text: prompt.slice(textCursor, index),
        promptOffset: textCursor,
      }) === true
    ) {
      return true;
    }
    if (visitor({ type: "terminal-context", promptOffset: index }) === true) {
      return true;
    }
    textCursor = index + 1;
  }

  if (
    textCursor < prompt.length &&
    visitor({
      type: "text",
      text: prompt.slice(textCursor),
      promptOffset: textCursor,
    }) === true
  ) {
    return true;
  }

  return false;
}

function forEachPromptTextSlice(
  prompt: string,
  visitor: (text: string, promptOffset: number) => boolean | void,
): boolean {
  return forEachPromptSegmentSlice(prompt, (slice) => {
    if (slice.type !== "text") {
      return false;
    }
    return visitor(slice.text, slice.promptOffset);
  });
}

function forEachMentionMatch(
  prompt: string,
  visitor: (match: RegExpMatchArray, promptOffset: number) => boolean | void,
): boolean {
  return forEachPromptTextSlice(prompt, (text, promptOffset) => {
    for (const match of text.matchAll(MENTION_TOKEN_REGEX)) {
      if (visitor(match, promptOffset) === true) {
        return true;
      }
    }
    return false;
  });
}

function forEachCustomTokenMatch(
  prompt: string,
  customTokenRegex: RegExp | null,
  visitor: (match: RegExpMatchArray, promptOffset: number) => boolean | void,
): boolean {
  if (customTokenRegex === null) {
    return false;
  }
  return forEachPromptTextSlice(prompt, (text, promptOffset) => {
    for (const match of text.matchAll(customTokenRegex)) {
      if (visitor(match, promptOffset) === true) {
        return true;
      }
    }
    return false;
  });
}

function splitPromptTextIntoComposerSegments(
  text: string,
  customTokenRegex: RegExp | null,
): ComposerPromptSegment[] {
  const segments: ComposerPromptSegment[] = [];
  if (!text) {
    return segments;
  }

  const matches = [
    ...Array.from(text.matchAll(MENTION_TOKEN_REGEX), (match) => {
      const fullMatch = match[0];
      const prefix = match[1] ?? "";
      const path = match[2] ?? "";
      const matchIndex = match.index ?? 0;
      const start = matchIndex + prefix.length;
      const end = start + fullMatch.length - prefix.length;
      return { type: "mention" as const, value: path, start, end };
    }),
    ...Array.from(text.matchAll(customTokenRegex ?? /$^/g), (match) => {
      const fullMatch = match[0];
      const prefix = match[1] ?? "";
      const tokenText = match[2] ?? "";
      const matchIndex = match.index ?? 0;
      const start = matchIndex + prefix.length;
      const end = start + fullMatch.length - prefix.length;
      return { type: "custom-token" as const, value: tokenText, start, end };
    }),
  ]
    .filter(
      (
        match,
      ): match is {
        type: "mention" | "custom-token";
        value: string;
        start: number;
        end: number;
      } => match !== null,
    )
    .toSorted((left, right) => left.start - right.start);

  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) {
      continue;
    }
    if (match.start > cursor) {
      pushTextSegment(segments, text.slice(cursor, match.start));
    }
    if (match.type === "mention") {
      if (match.value.length > 0) {
        segments.push({ type: "mention", path: match.value });
      } else {
        pushTextSegment(segments, text.slice(match.start, match.end));
      }
    } else if (match.value.length > 0) {
      segments.push({ type: "custom-token", tokenText: match.value });
    } else {
      pushTextSegment(segments, text.slice(match.start, match.end));
    }
    cursor = match.end;
  }

  if (cursor < text.length) {
    pushTextSegment(segments, text.slice(cursor));
  }

  return segments;
}

export function selectionTouchesMentionBoundary(
  prompt: string,
  start: number,
  end: number,
  options?: ComposerPromptInlineTokenOptions,
): boolean {
  if (!prompt || start >= end) {
    return false;
  }
  const customTokenRegex = buildCustomTokenRegex(toCustomTokenTexts(options?.customTokenTexts));

  const touchesBoundary = (
    match: RegExpMatchArray,
    promptOffset: number,
    prefixGroupIndex: number,
  ) => {
    const fullMatch = match[0];
    const prefix = match[prefixGroupIndex] ?? "";
    const matchIndex = match.index ?? 0;
    const tokenStart = promptOffset + matchIndex + prefix.length;
    const tokenEnd = tokenStart + fullMatch.length - prefix.length;
    const beforeTokenIndex = tokenStart - 1;
    const afterTokenIndex = tokenEnd;

    if (
      beforeTokenIndex >= 0 &&
      /\s/.test(prompt[beforeTokenIndex] ?? "") &&
      rangeIncludesIndex(start, end, beforeTokenIndex)
    ) {
      return true;
    }

    if (
      afterTokenIndex < prompt.length &&
      /\s/.test(prompt[afterTokenIndex] ?? "") &&
      rangeIncludesIndex(start, end, afterTokenIndex)
    ) {
      return true;
    }
    return false;
  };

  return (
    forEachMentionMatch(prompt, (match, promptOffset) => touchesBoundary(match, promptOffset, 1)) ||
    forEachCustomTokenMatch(prompt, customTokenRegex, (match, promptOffset) =>
      touchesBoundary(match, promptOffset, 1),
    )
  );
}

export function splitPromptIntoComposerSegments(
  prompt: string,
  terminalContexts: ReadonlyArray<TerminalContextDraft> = [],
  options?: ComposerPromptInlineTokenOptions,
): ComposerPromptSegment[] {
  if (!prompt) {
    return [];
  }

  const segments: ComposerPromptSegment[] = [];
  let terminalContextIndex = 0;
  const customTokenRegex = buildCustomTokenRegex(toCustomTokenTexts(options?.customTokenTexts));
  forEachPromptSegmentSlice(prompt, (slice) => {
    if (slice.type === "text") {
      segments.push(...splitPromptTextIntoComposerSegments(slice.text, customTokenRegex));
      return false;
    }

    segments.push({
      type: "terminal-context",
      context: terminalContexts[terminalContextIndex] ?? null,
    });
    terminalContextIndex += 1;
    return false;
  });

  return segments;
}
