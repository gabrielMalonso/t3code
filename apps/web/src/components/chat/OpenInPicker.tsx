import { type EditorId, type ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useMemo } from "react";
import { isOpenFavoriteEditorShortcut, shortcutLabelForCommand } from "../../keybindings";
import { isPersistablePreferredEditor, usePreferredEditor } from "../../editorPreferences";
import { ChevronDownIcon, FolderClosedIcon, TerminalSquareIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Group, GroupSeparator } from "../ui/group";
import { Menu, MenuItem, MenuPopup, MenuShortcut, MenuTrigger } from "../ui/menu";
import {
  AntigravityIcon,
  CursorIcon,
  Icon,
  KiroIcon,
  TraeIcon,
  VisualStudioCode,
  VisualStudioCodeInsiders,
  VSCodium,
  Zed,
} from "../Icons";
import {
  AquaIcon,
  CLionIcon,
  DataGripIcon,
  DataSpellIcon,
  GoLandIcon,
  IntelliJIdeaIcon,
  PhpStormIcon,
  PyCharmIcon,
  RiderIcon,
  RubyMineIcon,
  RustRoverIcon,
  WebStormIcon,
} from "../JetBrainsIcons";
import { isMacPlatform, isWindowsPlatform } from "~/lib/utils";
import { readLocalApi } from "~/localApi";

interface OpenInWorkspaceInput {
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  openInCwd: string | null;
  compact?: boolean;
  enableShortcut?: boolean;
}

type OpenInOption = { label: string; Icon: Icon; value: EditorId };

const resolveOptions = (
  platform: string,
  availableEditors: ReadonlyArray<EditorId>,
): ReadonlyArray<OpenInOption> => {
  const baseOptions: ReadonlyArray<OpenInOption> = [
    {
      label: "Cursor",
      Icon: CursorIcon,
      value: "cursor",
    },
    {
      label: "Trae",
      Icon: TraeIcon,
      value: "trae",
    },
    {
      label: "Kiro",
      Icon: KiroIcon,
      value: "kiro",
    },
    {
      label: "VS Code",
      Icon: VisualStudioCode,
      value: "vscode",
    },
    {
      label: "VS Code Insiders",
      Icon: VisualStudioCodeInsiders,
      value: "vscode-insiders",
    },
    {
      label: "VSCodium",
      Icon: VSCodium,
      value: "vscodium",
    },
    {
      label: "Zed",
      Icon: Zed,
      value: "zed",
    },
    {
      label: "Antigravity",
      Icon: AntigravityIcon,
      value: "antigravity",
    },
    {
      label: "IntelliJ IDEA",
      Icon: IntelliJIdeaIcon,
      value: "idea",
    },
    {
      label: "Ghostty",
      Icon: TerminalSquareIcon,
      value: "ghostty",
    },
    {
      label: "Aqua",
      Icon: AquaIcon,
      value: "aqua",
    },
    {
      label: "CLion",
      Icon: CLionIcon,
      value: "clion",
    },
    {
      label: "DataGrip",
      Icon: DataGripIcon,
      value: "datagrip",
    },
    {
      label: "DataSpell",
      Icon: DataSpellIcon,
      value: "dataspell",
    },
    {
      label: "GoLand",
      Icon: GoLandIcon,
      value: "goland",
    },
    {
      label: "PhpStorm",
      Icon: PhpStormIcon,
      value: "phpstorm",
    },
    {
      label: "PyCharm",
      Icon: PyCharmIcon,
      value: "pycharm",
    },
    {
      label: "Rider",
      Icon: RiderIcon,
      value: "rider",
    },
    {
      label: "RubyMine",
      Icon: RubyMineIcon,
      value: "rubymine",
    },
    {
      label: "RustRover",
      Icon: RustRoverIcon,
      value: "rustrover",
    },
    {
      label: "WebStorm",
      Icon: WebStormIcon,
      value: "webstorm",
    },
    {
      label: isMacPlatform(platform)
        ? "Finder"
        : isWindowsPlatform(platform)
          ? "Explorer"
          : "Files",
      Icon: FolderClosedIcon,
      value: "file-manager",
    },
  ];
  const availableEditorSet = new Set(availableEditors);
  return baseOptions.filter((option) => availableEditorSet.has(option.value));
};

export function useOpenInWorkspace({
  keybindings,
  availableEditors,
  openInCwd,
}: OpenInWorkspaceInput) {
  const [preferredEditor, setPreferredEditor] = usePreferredEditor(availableEditors);
  const options = useMemo(
    () => resolveOptions(navigator.platform, availableEditors),
    [availableEditors],
  );
  const primaryOption = options.find(({ value }) => value === preferredEditor) ?? null;

  const openInEditor = useCallback(
    (editorId: EditorId | null) => {
      const api = readLocalApi();
      if (!api || !openInCwd) return;
      const editor = editorId ?? preferredEditor;
      if (!editor) return;
      void api.shell.openInEditor(openInCwd, editor);
      if (isPersistablePreferredEditor(editor)) {
        setPreferredEditor(editor);
      }
    },
    [preferredEditor, openInCwd, setPreferredEditor],
  );

  const openFavoriteEditorShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "editor.openFavorite"),
    [keybindings],
  );

  return {
    openFavoriteEditorShortcutLabel,
    openInCwd,
    openInEditor,
    options,
    preferredEditor,
    primaryOption,
  };
}

export function OpenInMenuItems({
  openFavoriteEditorShortcutLabel,
  openInCwd,
  openInEditor,
  options,
  preferredEditor,
}: ReturnType<typeof useOpenInWorkspace>) {
  if (options.length === 0) {
    return <MenuItem disabled>No installed editors found</MenuItem>;
  }

  return (
    <>
      {options.map(({ label, Icon, value }) => (
        <MenuItem key={value} disabled={!openInCwd} onClick={() => openInEditor(value)}>
          <Icon aria-hidden="true" className="text-muted-foreground" />
          {label}
          {value === preferredEditor && openFavoriteEditorShortcutLabel && (
            <MenuShortcut>{openFavoriteEditorShortcutLabel}</MenuShortcut>
          )}
        </MenuItem>
      ))}
    </>
  );
}

export const OpenInPicker = memo(function OpenInPicker(props: OpenInWorkspaceInput) {
  const {
    openFavoriteEditorShortcutLabel,
    openInCwd,
    openInEditor,
    options,
    preferredEditor,
    primaryOption,
  } = useOpenInWorkspace(props);
  const { compact = false, enableShortcut = true, keybindings } = props;

  useEffect(() => {
    if (!enableShortcut) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      const api = readLocalApi();
      if (!isOpenFavoriteEditorShortcut(e, props.keybindings)) return;
      if (!api || !openInCwd) return;
      if (!preferredEditor) return;

      e.preventDefault();
      void api.shell.openInEditor(openInCwd, preferredEditor);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enableShortcut, preferredEditor, keybindings, openInCwd]);

  return (
    <Group aria-label="Open in editor">
      <Button
        aria-label={compact ? "Open file in preferred editor" : undefined}
        size="xs"
        variant="outline"
        disabled={!preferredEditor || !openInCwd}
        onClick={() => openInEditor(preferredEditor)}
      >
        {primaryOption?.Icon && <primaryOption.Icon aria-hidden="true" className="size-3.5" />}
        <span
          className={
            compact
              ? "sr-only"
              : "sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5"
          }
        >
          Open
        </span>
      </Button>
      <GroupSeparator {...(!compact ? { className: "hidden @3xl/header-actions:block" } : {})} />
      <Menu>
        <MenuTrigger
          render={
            <Button
              aria-label={compact ? "Choose editor" : "Copy options"}
              size="icon-xs"
              variant="outline"
            />
          }
        >
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end">
          <OpenInMenuItems
            openFavoriteEditorShortcutLabel={openFavoriteEditorShortcutLabel}
            openInCwd={openInCwd}
            openInEditor={openInEditor}
            options={options}
            preferredEditor={preferredEditor}
            primaryOption={primaryOption}
          />
        </MenuPopup>
      </Menu>
    </Group>
  );
});
