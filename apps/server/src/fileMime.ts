import {
  SAFE_TEXT_FILE_EXTENSIONS,
  isAllowedFileMimeType,
  isAllowedFileExtension,
  inferFileExtension,
} from "@t3tools/shared/fileTypes";

export { SAFE_TEXT_FILE_EXTENSIONS, isAllowedFileMimeType, isAllowedFileExtension, inferFileExtension };

export function isAllowedFileAttachment(input: {
  mimeType: string;
  fileName: string;
}): boolean {
  return isAllowedFileMimeType(input.mimeType) || isAllowedFileExtension(input.fileName);
}
