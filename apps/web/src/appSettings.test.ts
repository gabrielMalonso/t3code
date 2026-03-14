import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIMESTAMP_FORMAT,
  getAppModelOptions,
  getFavoriteModel,
  normalizeCustomModelSlugs,
  resolveAppModelSelection,
  toggleFavoriteModel,
  type AppSettings,
} from "./appSettings";

describe("normalizeCustomModelSlugs", () => {
  it("normalizes aliases, removes built-ins, and deduplicates values", () => {
    expect(
      normalizeCustomModelSlugs([
        " custom/internal-model ",
        "gpt-5.3-codex",
        "5.3",
        "custom/internal-model",
        "",
        null,
      ]),
    ).toEqual(["custom/internal-model"]);
  });
});

describe("getAppModelOptions", () => {
  it("appends saved custom models after the built-in options", () => {
    const options = getAppModelOptions("codex", ["custom/internal-model"]);

    expect(options.map((option) => option.slug)).toEqual([
      "gpt-5.4",
      "gpt-5.3-codex",
      "gpt-5.3-codex-spark",
      "gpt-5.2-codex",
      "gpt-5.2",
      "custom/internal-model",
    ]);
  });

  it("keeps the currently selected custom model available even if it is no longer saved", () => {
    const options = getAppModelOptions("codex", [], "custom/selected-model");

    expect(options.at(-1)).toEqual({
      slug: "custom/selected-model",
      name: "custom/selected-model",
      isCustom: true,
    });
  });
});

describe("resolveAppModelSelection", () => {
  it("preserves saved custom model slugs instead of falling back to the default", () => {
    expect(resolveAppModelSelection("codex", ["galapagos-alpha"], "galapagos-alpha")).toBe(
      "galapagos-alpha",
    );
  });

  it("falls back to the provider default when no model is selected", () => {
    expect(resolveAppModelSelection("codex", [], "")).toBe("gpt-5.4");
  });
});

describe("timestamp format defaults", () => {
  it("defaults timestamp format to locale", () => {
    expect(DEFAULT_TIMESTAMP_FORMAT).toBe("locale");
  });
});

function makeSettings(overrides?: Partial<AppSettings>): AppSettings {
  return {
    codexBinaryPath: "",
    codexHomePath: "",
    defaultThreadEnvMode: "local",
    confirmThreadDelete: true,
    enableAssistantStreaming: false,
    timestampFormat: "locale",
    customCodexModels: [],
    customClaudeModels: [],
    customCursorModels: [],
    favoriteModel: undefined,
    ...overrides,
  };
}

describe("getFavoriteModel", () => {
  it("returns null when no favorite is set", () => {
    expect(getFavoriteModel(makeSettings())).toBeNull();
  });

  it("returns the favorite with provider and model when set", () => {
    const settings = makeSettings({
      favoriteModel: { provider: "codex", model: "gpt-5.4" },
    });
    const fav = getFavoriteModel(settings);
    expect(fav).toEqual({ provider: "codex", model: "gpt-5.4" });
  });

  it("normalizes aliases to canonical slugs", () => {
    const settings = makeSettings({
      favoriteModel: { provider: "claudeCode", model: "opus" },
    });
    const fav = getFavoriteModel(settings);
    expect(fav).toEqual({ provider: "claudeCode", model: "claude-opus-4-6" });
  });

  it("returns null for invalid provider values", () => {
    const settings = makeSettings({
      favoriteModel: { provider: "invalid" as any, model: "gpt-5.4" },
    });
    expect(getFavoriteModel(settings)).toBeNull();
  });

  it("returns null for empty model values", () => {
    const settings = makeSettings({
      favoriteModel: { provider: "codex", model: "" },
    });
    expect(getFavoriteModel(settings)).toBeNull();
  });

  it("returns a single global favorite regardless of provider", () => {
    const settings = makeSettings({
      favoriteModel: { provider: "claudeCode", model: "claude-opus-4-6" },
    });
    const fav = getFavoriteModel(settings);
    expect(fav?.provider).toBe("claudeCode");
    expect(fav?.model).toBe("claude-opus-4-6");
  });
});

describe("toggleFavoriteModel", () => {
  it("sets a favorite model when none is set", () => {
    const settings = makeSettings();
    const patch = toggleFavoriteModel(settings, "codex", "gpt-5.4");
    expect(patch.favoriteModel).toEqual({ provider: "codex", model: "gpt-5.4" });
  });

  it("removes the favorite when toggling the same model", () => {
    const settings = makeSettings({
      favoriteModel: { provider: "codex", model: "gpt-5.4" },
    });
    const patch = toggleFavoriteModel(settings, "codex", "gpt-5.4");
    expect(patch.favoriteModel).toBeUndefined();
  });

  it("switches the favorite to a different model in the same provider", () => {
    const settings = makeSettings({
      favoriteModel: { provider: "codex", model: "gpt-5.4" },
    });
    const patch = toggleFavoriteModel(settings, "codex", "gpt-5.3-codex");
    expect(patch.favoriteModel).toEqual({ provider: "codex", model: "gpt-5.3-codex" });
  });

  it("switches the favorite to a different provider entirely", () => {
    const settings = makeSettings({
      favoriteModel: { provider: "codex", model: "gpt-5.4" },
    });
    const patch = toggleFavoriteModel(settings, "claudeCode", "claude-opus-4-6");
    expect(patch.favoriteModel).toEqual({ provider: "claudeCode", model: "claude-opus-4-6" });
  });

  it("normalizes aliases when toggling", () => {
    const settings = makeSettings();
    const patch = toggleFavoriteModel(settings, "claudeCode", "opus");
    expect(patch.favoriteModel).toEqual({ provider: "claudeCode", model: "claude-opus-4-6" });
  });
});
