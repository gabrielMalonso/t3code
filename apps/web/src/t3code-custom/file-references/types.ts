export type ComposerFileReferenceScope = "workspace" | "external";

export type ComposerFileReferenceKind = "pdf" | "text" | "code" | "data" | "other";

export interface ComposerFileReference {
  id: string;
  name: string;
  path: string;
  mimeType: string | null;
  sizeBytes: number;
}

export interface DisplayedFileReference {
  path: string;
  scope: ComposerFileReferenceScope;
  label: string;
  kind: ComposerFileReferenceKind;
}
