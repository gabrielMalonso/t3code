import { describe, expect, it } from "vitest";
import {
  collapseWhitespace,
  redactSensitiveText,
  sanitizeUrl,
  truncateText,
} from "../../src/shared/privacy";

describe("privacy helpers", () => {
  it("collapses whitespace and truncates text", () => {
    expect(collapseWhitespace("  um\n\ntexto\tcurto  ")).toBe("um texto curto");
    expect(truncateText("abcdef", 4)).toBe("abc...");
  });

  it("redacts common sensitive values", () => {
    const value =
      "ana@example.com CPF 123.456.789-10 token abcdefghijklmnopqrstuvwxyz123456 tel (11) 99999-1111";

    expect(redactSensitiveText(value)).toContain("[email]");
    expect(redactSensitiveText(value)).toContain("[cpf]");
    expect(redactSensitiveText(value)).toContain("[token]");
    expect(redactSensitiveText(value)).toContain("[telefone]");
  });

  it("redacts sensitive query parameters", () => {
    expect(
      sanitizeUrl(
        "https://example.com/path?token=abc&view=card&password=secret&membershipId=kh7827jayjbfe3nhm8zc97yctd84n3yt",
      ),
    ).toBe(
      "https://example.com/path?token=<redacted>&view=card&password=<redacted>&membershipId=<redacted>",
    );
  });
});
