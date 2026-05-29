import { describe, expect, it } from "vitest";

import {
  EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE,
  appendExternalComposerIntakePrompt,
  composerFileReferenceFromExternalIntake,
  validateExternalComposerIntakeMessage,
} from "./externalComposerIntake";

describe("validateExternalComposerIntakeMessage", () => {
  it("accepts a PointNShoot composer intake payload", () => {
    const result = validateExternalComposerIntakeMessage({
      type: EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE,
      requestId: "pns-1",
      source: "pointnshoot",
      prompt: "  # UI Note\n\n## Prompt\n\nAjuste este botão.  ",
      image: {
        path: " /Users/test/Downloads/PointNShoot-PNG/button.png ",
        name: "button.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        width: 960,
        height: 720,
      },
    });

    expect(result).toEqual({
      ok: true,
      request: {
        type: EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE,
        requestId: "pns-1",
        source: "pointnshoot",
        action: "insert",
        prompt: "# UI Note\n\n## Prompt\n\nAjuste este botão.",
        append: true,
        focus: true,
        image: {
          path: "/Users/test/Downloads/PointNShoot-PNG/button.png",
          name: "button.png",
          mimeType: "image/png",
          sizeBytes: 1234,
          width: 960,
          height: 720,
        },
      },
    });
  });

  it("rejects unsupported actions", () => {
    const result = validateExternalComposerIntakeMessage({
      type: EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE,
      requestId: "pns-1",
      source: "pointnshoot",
      action: "insert-and-send",
      prompt: "hello",
    });

    expect(result).toEqual({
      ok: false,
      requestId: "pns-1",
      reason: "unsupported-action",
    });
  });

  it("rejects empty prompts", () => {
    const result = validateExternalComposerIntakeMessage({
      type: EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE,
      requestId: "pns-1",
      source: "pointnshoot",
      prompt: "   ",
    });

    expect(result).toEqual({
      ok: false,
      requestId: "pns-1",
      reason: "empty-prompt",
    });
  });
});

describe("appendExternalComposerIntakePrompt", () => {
  it("appends intake text after existing prompt", () => {
    expect(
      appendExternalComposerIntakePrompt({
        currentPrompt: "Existing draft\n",
        incomingPrompt: "\n# UI Note",
        append: true,
      }),
    ).toBe("Existing draft\n\n# UI Note");
  });

  it("replaces existing prompt when append is false", () => {
    expect(
      appendExternalComposerIntakePrompt({
        currentPrompt: "Existing draft",
        incomingPrompt: "# UI Note",
        append: false,
      }),
    ).toBe("# UI Note");
  });
});

describe("composerFileReferenceFromExternalIntake", () => {
  it("creates an external image file reference from the intake image", () => {
    expect(
      composerFileReferenceFromExternalIntake({
        id: "ref-1",
        image: {
          path: "/Users/test/Downloads/PointNShoot-PNG/button.png",
          mimeType: "image/png",
          sizeBytes: 1234,
        },
      }),
    ).toEqual({
      id: "ref-1",
      name: "button.png",
      path: "/Users/test/Downloads/PointNShoot-PNG/button.png",
      mimeType: "image/png",
      sizeBytes: 1234,
    });
  });
});
