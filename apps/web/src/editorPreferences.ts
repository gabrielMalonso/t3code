import { EDITORS, EditorId, LocalApi } from "@t3tools/contracts";
import { getLocalStorageItem, setLocalStorageItem, useLocalStorage } from "./hooks/useLocalStorage";
import { useMemo } from "react";

const LAST_EDITOR_KEY = "t3code:last-editor";
const WORKSPACE_ONLY_EDITOR_IDS = new Set<EditorId>(["ghostty"]);

export function isPersistablePreferredEditor(editor: EditorId): boolean {
  return !WORKSPACE_ONLY_EDITOR_IDS.has(editor);
}

export function resolvePreferredEditor(
  availableEditors: readonly EditorId[],
  storedEditor: EditorId | null,
): EditorId | null {
  const availableEditorIds = new Set(availableEditors);
  if (
    storedEditor &&
    availableEditorIds.has(storedEditor) &&
    isPersistablePreferredEditor(storedEditor)
  ) {
    return storedEditor;
  }
  return (
    EDITORS.find(
      (editor) => availableEditorIds.has(editor.id) && isPersistablePreferredEditor(editor.id),
    )?.id ?? null
  );
}

export function usePreferredEditor(availableEditors: ReadonlyArray<EditorId>) {
  const [lastEditor, setLastEditor] = useLocalStorage(LAST_EDITOR_KEY, null, EditorId);

  const effectiveEditor = useMemo(() => {
    return resolvePreferredEditor(availableEditors, lastEditor);
  }, [lastEditor, availableEditors]);

  return [effectiveEditor, setLastEditor] as const;
}

export function resolveAndPersistPreferredEditor(
  availableEditors: readonly EditorId[],
): EditorId | null {
  const stored = getLocalStorageItem(LAST_EDITOR_KEY, EditorId);
  const editor = resolvePreferredEditor(availableEditors, stored);
  if (editor) setLocalStorageItem(LAST_EDITOR_KEY, editor, EditorId);
  return editor ?? null;
}

export async function openInPreferredEditor(api: LocalApi, targetPath: string): Promise<EditorId> {
  const { availableEditors } = await api.server.getConfig();
  const editor = resolveAndPersistPreferredEditor(availableEditors);
  if (!editor) throw new Error("No available editors found.");
  await api.shell.openInEditor(targetPath, editor);
  return editor;
}
