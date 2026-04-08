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
export { resolveComposerFileReferencesFromFiles } from "./resolveFiles";
export type {
  ComposerFileReference,
  ComposerFileReferenceKind,
  ComposerFileReferenceScope,
  DisplayedFileReference,
} from "./types";
