import { afterEach, describe, expect, it, vi } from "vitest";
import { appendDiagnostic, errorDiagnostic, makeDiagnostic } from "../../src/shared/diagnostics";

describe("diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps info diagnostics internal without writing to the console", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const entry = makeDiagnostic(
      "content",
      "info",
      "clipboard:writeText:ok",
      "UI Note copied from focused tab.",
    );
    const entries = appendDiagnostic([], entry);

    expect(entries).toEqual([entry]);
    expect(debug).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("keeps warning and error diagnostics visible in the console", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const warning = makeDiagnostic(
      "background",
      "warn",
      "offscreen:close",
      "Could not close offscreen document.",
    );
    const failure = errorDiagnostic(
      "offscreen",
      "render:unhandled-error",
      new Error("render failed"),
    );

    appendDiagnostic([], warning);
    appendDiagnostic([], failure);

    expect(debug).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[Annotations]", warning.step, warning.message, {});
    expect(error).toHaveBeenCalledWith(
      "[Annotations]",
      failure.step,
      failure.message,
      failure.details,
    );
  });
});
