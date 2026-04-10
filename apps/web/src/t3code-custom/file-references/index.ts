export { fileReferenceCopy } from "./i18n";
export {
  appendFileReferencesToPrompt,
  buildFileReferencesBlock,
  extractTrailingFileReferences,
} from "./serialization";
export {
  classifyFileReferenceScope,
  relativeFileReferencePath,
  toDisplayedFileReference,
} from "./paths";
export { deriveDisplayedUserMessageStateWithCustomContent } from "./messageDisplay";
export {
  COMPOSER_PASTE_FILE_REFERENCE_CHAR_THRESHOLD,
  COMPOSER_PASTE_FILE_REFERENCE_DIRECTORY,
  COMPOSER_PASTE_FILE_REFERENCE_LINE_THRESHOLD,
  buildComposerPastedTextFileRelativePath,
  createComposerFileReferenceFromWorkspaceTextFile,
  removePastedTextFromComposer,
  restorePastedTextIntoComposer,
  saveComposerPastedTextAsFileReference,
  shouldAutoRestoreComposerPasteSnapshot,
  shouldConvertComposerPastedTextToFileReference,
} from "./paste";
export { resolveComposerFileReferencesFromFiles } from "./resolveFiles";
export type {
  ComposerFileReference,
  ComposerFileReferenceKind,
  ComposerFileReferenceScope,
  DisplayedFileReference,
} from "./types";
