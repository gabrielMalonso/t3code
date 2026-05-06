import type { EditorId, ProjectScript, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { DiffIcon, EllipsisIcon, TerminalSquareIcon } from "lucide-react";
import { memo } from "react";

import {
  ProjectScriptsDialogs,
  ProjectScriptsMenuItems,
  type NewProjectScriptInput,
  useProjectScriptsController,
} from "../ProjectScriptsControl";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "../ui/menu";
import { OpenInMenuItems, useOpenInWorkspace } from "./OpenInPicker";

interface HeaderOverflowMenuProps {
  activeProjectName: string | undefined;
  activeProjectScripts: ProjectScript[] | undefined;
  availableEditors: ReadonlyArray<EditorId>;
  diffOpen: boolean;
  diffToggleShortcutLabel: string | null;
  isGitRepo: boolean;
  isRemoteEnvironment: boolean;
  keybindings: ResolvedKeybindingsConfig;
  openInCwd: string | null;
  preferredScriptId: string | null;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalToggleShortcutLabel: string | null;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
  onRunProjectScript: (script: ProjectScript) => void;
  onToggleDiff: () => void;
  onToggleTerminal: () => void;
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
}

export const HeaderOverflowMenu = memo(function HeaderOverflowMenu({
  activeProjectName,
  activeProjectScripts,
  availableEditors,
  diffOpen,
  diffToggleShortcutLabel,
  isGitRepo,
  isRemoteEnvironment,
  keybindings,
  openInCwd,
  preferredScriptId,
  terminalAvailable,
  terminalOpen,
  terminalToggleShortcutLabel,
  onAddProjectScript,
  onDeleteProjectScript,
  onRunProjectScript,
  onToggleDiff,
  onToggleTerminal,
  onUpdateProjectScript,
}: HeaderOverflowMenuProps) {
  const scriptsController = useProjectScriptsController({
    scripts: activeProjectScripts ?? [],
    keybindings,
    preferredScriptId,
    onRunScript: onRunProjectScript,
    onAddScript: onAddProjectScript,
    onUpdateScript: onUpdateProjectScript,
    onDeleteScript: onDeleteProjectScript,
  });
  const openInWorkspace = useOpenInWorkspace({
    keybindings,
    availableEditors,
    openInCwd,
  });
  const showScripts = activeProjectScripts !== undefined;
  const showOpen = Boolean(activeProjectName && !isRemoteEnvironment);
  const showPanels = terminalAvailable || isGitRepo || diffOpen;

  if (!showScripts && !showOpen && !showPanels) {
    return null;
  }

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              size="icon-xs"
              variant="outline"
              className="md:hidden"
              aria-label="More header actions"
            />
          }
        >
          <EllipsisIcon aria-hidden="true" className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end" className="w-64">
          {showScripts ? (
            <>
              <MenuGroup>
                <MenuGroupLabel>Scripts</MenuGroupLabel>
                <ProjectScriptsMenuItems
                  controller={scriptsController}
                  editButtonPresentation="always"
                />
              </MenuGroup>
            </>
          ) : null}
          {showOpen ? (
            <>
              {showScripts ? <MenuSeparator /> : null}
              <MenuGroup>
                <MenuGroupLabel>Open</MenuGroupLabel>
                <OpenInMenuItems {...openInWorkspace} />
              </MenuGroup>
            </>
          ) : null}
          {showPanels ? (
            <>
              {showScripts || showOpen ? <MenuSeparator /> : null}
              <MenuGroup>
                <MenuGroupLabel>Panels</MenuGroupLabel>
                {terminalAvailable ? (
                  <MenuItem onClick={onToggleTerminal}>
                    <TerminalSquareIcon className="size-4" />
                    {terminalOpen ? "Hide terminal" : "Show terminal"}
                    {terminalToggleShortcutLabel ? (
                      <MenuShortcut>{terminalToggleShortcutLabel}</MenuShortcut>
                    ) : null}
                  </MenuItem>
                ) : null}
                {isGitRepo || diffOpen ? (
                  <MenuItem disabled={!isGitRepo && !diffOpen} onClick={onToggleDiff}>
                    <DiffIcon className="size-4" />
                    {diffOpen ? "Hide diffs" : "Show diffs"}
                    {diffToggleShortcutLabel ? (
                      <MenuShortcut>{diffToggleShortcutLabel}</MenuShortcut>
                    ) : null}
                  </MenuItem>
                ) : null}
              </MenuGroup>
            </>
          ) : null}
        </MenuPopup>
      </Menu>
      {showScripts ? <ProjectScriptsDialogs controller={scriptsController} /> : null}
    </>
  );
});
