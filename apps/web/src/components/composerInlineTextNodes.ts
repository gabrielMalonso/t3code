import {
  $applyNodeReplacement,
  TextNode,
  type EditorConfig,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
} from "lexical";

import { basenameOfPath, getVscodeIconUrlForEntry, inferEntryKindFromPath } from "~/vscode-icons";

import {
  COMPOSER_INLINE_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
} from "./composerInlineChip";

type SerializedComposerMentionNode = Spread<
  {
    path: string;
    type: "composer-mention";
    version: 1;
  },
  SerializedTextNode
>;

type SerializedComposerCustomTokenNode = Spread<
  {
    tokenText: string;
    type: "composer-custom-token";
    version: 1;
  },
  SerializedTextNode
>;

function resolvedThemeFromDocument(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function renderMentionChipDom(container: HTMLElement, pathValue: string): void {
  container.textContent = "";
  container.style.setProperty("user-select", "none");
  container.style.setProperty("-webkit-user-select", "none");

  const theme = resolvedThemeFromDocument();
  const icon = document.createElement("img");
  icon.alt = "";
  icon.ariaHidden = "true";
  icon.className = COMPOSER_INLINE_CHIP_ICON_CLASS_NAME;
  icon.loading = "lazy";
  icon.src = getVscodeIconUrlForEntry(pathValue, inferEntryKindFromPath(pathValue), theme);

  const label = document.createElement("span");
  label.className = COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME;
  label.textContent = basenameOfPath(pathValue);

  container.append(icon, label);
}

function renderCustomTokenChipDom(container: HTMLElement, tokenText: string): void {
  container.textContent = "";
  container.style.setProperty("user-select", "none");
  container.style.setProperty("-webkit-user-select", "none");

  const label = document.createElement("span");
  label.className = COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME;
  label.textContent = tokenText;

  container.append(label);
}

export class ComposerMentionNode extends TextNode {
  __path: string;

  static override getType(): string {
    return "composer-mention";
  }

  static override clone(node: ComposerMentionNode): ComposerMentionNode {
    return new ComposerMentionNode(node.__path, node.__key);
  }

  static override importJSON(serializedNode: SerializedComposerMentionNode): ComposerMentionNode {
    return $createComposerMentionNode(serializedNode.path);
  }

  constructor(path: string, key?: NodeKey) {
    const normalizedPath = path.startsWith("@") ? path.slice(1) : path;
    super(`@${normalizedPath}`, key);
    this.__path = normalizedPath;
  }

  override exportJSON(): SerializedComposerMentionNode {
    return {
      ...super.exportJSON(),
      path: this.__path,
      type: "composer-mention",
      version: 1,
    };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const dom = document.createElement("span");
    dom.className = COMPOSER_INLINE_CHIP_CLASS_NAME;
    dom.contentEditable = "false";
    dom.setAttribute("spellcheck", "false");
    renderMentionChipDom(dom, this.__path);
    return dom;
  }

  override updateDOM(
    prevNode: ComposerMentionNode,
    dom: HTMLElement,
    _config: EditorConfig,
  ): boolean {
    dom.contentEditable = "false";
    if (prevNode.__text !== this.__text || prevNode.__path !== this.__path) {
      renderMentionChipDom(dom, this.__path);
    }
    return false;
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }

  override isTextEntity(): true {
    return true;
  }

  override isToken(): true {
    return true;
  }
}

export function $createComposerMentionNode(path: string): ComposerMentionNode {
  return $applyNodeReplacement(new ComposerMentionNode(path));
}

export class ComposerCustomTokenNode extends TextNode {
  __tokenText: string;

  static override getType(): string {
    return "composer-custom-token";
  }

  static override clone(node: ComposerCustomTokenNode): ComposerCustomTokenNode {
    return new ComposerCustomTokenNode(node.__tokenText, node.__key);
  }

  static override importJSON(
    serializedNode: SerializedComposerCustomTokenNode,
  ): ComposerCustomTokenNode {
    return $createComposerCustomTokenNode(serializedNode.tokenText);
  }

  constructor(tokenText: string, key?: NodeKey) {
    super(tokenText, key);
    this.__tokenText = tokenText;
  }

  override exportJSON(): SerializedComposerCustomTokenNode {
    return {
      ...super.exportJSON(),
      tokenText: this.__tokenText,
      type: "composer-custom-token",
      version: 1,
    };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const dom = document.createElement("span");
    dom.className = COMPOSER_INLINE_CHIP_CLASS_NAME;
    dom.contentEditable = "false";
    dom.setAttribute("spellcheck", "false");
    renderCustomTokenChipDom(dom, this.__tokenText);
    return dom;
  }

  override updateDOM(
    prevNode: ComposerCustomTokenNode,
    dom: HTMLElement,
    _config: EditorConfig,
  ): boolean {
    dom.contentEditable = "false";
    if (prevNode.__text !== this.__text || prevNode.__tokenText !== this.__tokenText) {
      renderCustomTokenChipDom(dom, this.__tokenText);
    }
    return false;
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }

  override isTextEntity(): true {
    return true;
  }

  override isToken(): true {
    return true;
  }
}

export function $createComposerCustomTokenNode(tokenText: string): ComposerCustomTokenNode {
  return $applyNodeReplacement(new ComposerCustomTokenNode(tokenText));
}

export type ComposerInlineTextNode = ComposerMentionNode | ComposerCustomTokenNode;

export function isComposerInlineTextNode(candidate: unknown): candidate is ComposerInlineTextNode {
  return candidate instanceof ComposerMentionNode || candidate instanceof ComposerCustomTokenNode;
}
