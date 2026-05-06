import "../../index.css";

import type { ProjectScript } from "@t3tools/contracts";
import type { ComponentProps } from "react";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { HeaderOverflowMenu } from "./HeaderOverflowMenu";

const TEST_SCRIPT: ProjectScript = {
  id: "test",
  name: "Test",
  command: "bun run test",
  icon: "test",
  runOnWorktreeCreate: false,
};

function mountOverflowMenu(overrides?: Partial<ComponentProps<typeof HeaderOverflowMenu>>) {
  const host = document.createElement("div");
  document.body.append(host);
  const props = {
    activeProjectName: "t3code",
    activeProjectScripts: [TEST_SCRIPT],
    availableEditors: [],
    diffOpen: false,
    diffToggleShortcutLabel: null,
    isGitRepo: true,
    isRemoteEnvironment: false,
    keybindings: [],
    openInCwd: "/repo/project",
    preferredScriptId: null,
    terminalAvailable: true,
    terminalOpen: false,
    terminalToggleShortcutLabel: null,
    onAddProjectScript: vi.fn(),
    onDeleteProjectScript: vi.fn(),
    onRunProjectScript: vi.fn(),
    onToggleDiff: vi.fn(),
    onToggleTerminal: vi.fn(),
    onUpdateProjectScript: vi.fn(),
    ...overrides,
  } satisfies ComponentProps<typeof HeaderOverflowMenu>;

  return {
    host,
    props,
    screen: render(<HeaderOverflowMenu {...props} />, { container: host }),
  };
}

describe("HeaderOverflowMenu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("groups mobile-only header actions behind one overflow trigger", async () => {
    const mounted = mountOverflowMenu();
    const screen = await mounted.screen;

    try {
      await page.viewport(430, 932);
      await page.getByLabelText("More header actions").click();

      await vi.waitFor(() => {
        const text = document.body.textContent ?? "";
        expect(text).toContain("Scripts");
        expect(text).toContain("Test");
        expect(text).toContain("Add action");
        expect(text).toContain("Open");
        expect(text).toContain("No installed editors found");
        expect(text).toContain("Panels");
        expect(text).toContain("Show terminal");
        expect(text).toContain("Show diffs");
      });
    } finally {
      await screen.unmount();
      mounted.host.remove();
    }
  });

  it("runs scripts and toggles panels from the overflow menu", async () => {
    const mounted = mountOverflowMenu();
    const screen = await mounted.screen;

    try {
      await page.viewport(430, 932);
      await page.getByLabelText("More header actions").click();
      await page.getByText("Test").click();
      expect(mounted.props.onRunProjectScript).toHaveBeenCalledWith(TEST_SCRIPT);

      await page.getByLabelText("More header actions").click();
      await page.getByText("Show terminal").click();
      expect(mounted.props.onToggleTerminal).toHaveBeenCalledTimes(1);

      await page.getByLabelText("More header actions").click();
      await page.getByText("Show diffs").click();
      expect(mounted.props.onToggleDiff).toHaveBeenCalledTimes(1);
    } finally {
      await screen.unmount();
      mounted.host.remove();
    }
  });
});
