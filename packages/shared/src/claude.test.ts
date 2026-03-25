import { describe, expect, it } from "vitest";

import { isClaudeSettingSource, normalizeClaudeSettingSources } from "./claude";

describe("isClaudeSettingSource", () => {
  it("accepts only supported Claude setting sources", () => {
    expect(isClaudeSettingSource("user")).toBe(true);
    expect(isClaudeSettingSource("project")).toBe(true);
    expect(isClaudeSettingSource("local")).toBe(true);
    expect(isClaudeSettingSource("workspace")).toBe(false);
    expect(isClaudeSettingSource(null)).toBe(false);
  });
});

describe("normalizeClaudeSettingSources", () => {
  it("deduplicates entries and restores canonical order", () => {
    expect(normalizeClaudeSettingSources(["local", "project", "local", "user"])).toEqual([
      "user",
      "project",
      "local",
    ]);
  });

  it("falls back to defaults for empty input", () => {
    expect(normalizeClaudeSettingSources([])).toEqual(["user", "project", "local"]);
  });

  it("ignores invalid entries while keeping valid ones", () => {
    expect(normalizeClaudeSettingSources(["project", "workspace", "local"])).toEqual([
      "project",
      "local",
    ]);
  });

  it("falls back to defaults when every entry is invalid", () => {
    expect(normalizeClaudeSettingSources(["workspace", "team"])).toEqual([
      "user",
      "project",
      "local",
    ]);
  });
});
