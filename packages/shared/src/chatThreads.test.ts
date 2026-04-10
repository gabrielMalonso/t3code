import { describe, expect, it } from "vitest";

import {
  buildPromptThreadTitleFallback,
  GENERIC_CHAT_THREAD_TITLE,
  isGenericChatThreadTitle,
  sanitizeGeneratedThreadTitle,
} from "./chatThreads";

describe("chatThreads", () => {
  it("builds short fallback titles from prompt text", () => {
    expect(
      buildPromptThreadTitleFallback("Investigate reconnect regressions after session restore"),
    ).toBe("Investigate reconnect regressions after");
  });

  it("falls back to the generic title when the source is empty", () => {
    expect(buildPromptThreadTitleFallback("   \n\t  ")).toBe(GENERIC_CHAT_THREAD_TITLE);
  });

  it("sanitizes generated titles down to four words", () => {
    expect(
      sanitizeGeneratedThreadTitle('"Reconnect failures after restart because state is stale."'),
    ).toBe("Reconnect failures after restart");
  });

  it("drops extra words before truncating mid-word", () => {
    expect(
      sanitizeGeneratedThreadTitle(
        '"Investigate websocket reconnect regressions after worktree restore"',
      ),
    ).toBe("Investigate websocket reconnect");
  });

  it("keeps generic title checks whitespace-safe", () => {
    expect(isGenericChatThreadTitle(" New thread ")).toBe(true);
    expect(isGenericChatThreadTitle("Manual rename")).toBe(false);
  });
});
