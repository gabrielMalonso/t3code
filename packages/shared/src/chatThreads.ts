export const GENERIC_CHAT_THREAD_TITLE = "New thread";

const MAX_CHAT_THREAD_TITLE_WORDS = 4;
const MAX_CHAT_THREAD_TITLE_CHARS = 40;

function normalizeTitleWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function trimTitleToken(token: string): string {
  return token.replace(/^[\s"'`([{]+|[\s"'`)\]}:;,.!?]+$/g, "");
}

function titleWords(value: string): string[] {
  return normalizeTitleWhitespace(value)
    .split(" ")
    .map(trimTitleToken)
    .filter((token) => token.length > 0);
}

function truncateChatThreadTitle(text: string): string {
  if (text.length <= MAX_CHAT_THREAD_TITLE_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_CHAT_THREAD_TITLE_CHARS - 3).trimEnd()}...`;
}

function compactChatThreadTitle(value: string): string {
  const unquoted = normalizeTitleWhitespace(value).replace(/^['"`]+|['"`]+$/g, "");
  const words = titleWords(unquoted).slice(0, MAX_CHAT_THREAD_TITLE_WORDS);
  if (words.length === 0) {
    return GENERIC_CHAT_THREAD_TITLE;
  }

  const compactWords = [...words];
  while (compactWords.length > 2 && compactWords.join(" ").length > MAX_CHAT_THREAD_TITLE_CHARS) {
    compactWords.pop();
  }

  const compactTitle = compactWords.join(" ");
  if (compactTitle.length <= MAX_CHAT_THREAD_TITLE_CHARS) {
    return compactTitle;
  }

  return truncateChatThreadTitle(compactTitle);
}

export function buildPromptThreadTitleFallback(message: string): string {
  return compactChatThreadTitle(message);
}

export function sanitizeGeneratedThreadTitle(raw: string): string {
  const firstLine = raw.trim().split(/\r?\n/g)[0] ?? "";
  return compactChatThreadTitle(firstLine);
}

export function isGenericChatThreadTitle(title: string | null | undefined): boolean {
  return normalizeTitleWhitespace(title ?? "") === GENERIC_CHAT_THREAD_TITLE;
}
