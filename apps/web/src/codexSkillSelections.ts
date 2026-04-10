export interface ComposerSkillSelection {
  name: string;
  path: string;
  rangeStart: number;
  rangeEnd: number;
}

const CODEX_SKILL_TOKEN_REGEX = /(^|\s)\$([a-zA-Z][a-zA-Z0-9_:-]*)(?=\s)/g;

function extractCodexSkillInvocations(prompt: string) {
  const invocations: Array<{ name: string; rangeStart: number; rangeEnd: number }> = [];
  for (const match of prompt.matchAll(CODEX_SKILL_TOKEN_REGEX)) {
    const fullMatch = match[0];
    const prefix = match[1] ?? "";
    const name = match[2] ?? "";
    const matchIndex = match.index ?? 0;
    const rangeStart = matchIndex + prefix.length;
    const rangeEnd = rangeStart + fullMatch.length - prefix.length;
    invocations.push({ name, rangeStart, rangeEnd });
  }
  return invocations;
}

function commonPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixLength(left: string, right: string, prefixLength: number): number {
  const max = Math.min(left.length, right.length) - prefixLength;
  let count = 0;
  while (count < max && left[left.length - 1 - count] === right[right.length - 1 - count]) {
    count += 1;
  }
  return count;
}

function isSelectionStillValid(
  prompt: string,
  selection: ComposerSkillSelection,
  matchedRanges: Set<string>,
): boolean {
  if (
    selection.rangeStart < 0 ||
    selection.rangeEnd <= selection.rangeStart ||
    selection.rangeEnd > prompt.length
  ) {
    return false;
  }
  if (prompt.slice(selection.rangeStart, selection.rangeEnd) !== `$${selection.name}`) {
    return false;
  }
  const rangeKey = `${selection.name}:${selection.rangeStart}:${selection.rangeEnd}`;
  if (matchedRanges.has(rangeKey)) {
    return true;
  }
  const invocationExists = extractCodexSkillInvocations(prompt).some(
    (entry) =>
      entry.name === selection.name &&
      entry.rangeStart === selection.rangeStart &&
      entry.rangeEnd === selection.rangeEnd,
  );
  if (invocationExists) {
    matchedRanges.add(rangeKey);
  }
  return invocationExists;
}

export function createComposerSkillSelection(input: {
  name: string;
  path: string;
  rangeStart: number;
}): ComposerSkillSelection {
  return {
    name: input.name,
    path: input.path,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeStart + input.name.length + 1,
  };
}

export function reconcileComposerSkillSelections(input: {
  previousPrompt: string;
  nextPrompt: string;
  selections: readonly ComposerSkillSelection[];
}): ComposerSkillSelection[] {
  if (input.selections.length === 0) {
    return [];
  }

  const prefixLength = commonPrefixLength(input.previousPrompt, input.nextPrompt);
  const suffixLength = commonSuffixLength(input.previousPrompt, input.nextPrompt, prefixLength);
  const previousChangedEnd = input.previousPrompt.length - suffixLength;
  const nextChangedEnd = input.nextPrompt.length - suffixLength;
  const delta = nextChangedEnd - previousChangedEnd;
  const matchedRanges = new Set<string>();

  return input.selections
    .map((selection) => {
      if (selection.rangeEnd <= prefixLength) {
        return selection;
      }
      if (selection.rangeStart >= previousChangedEnd) {
        return {
          ...selection,
          rangeStart: selection.rangeStart + delta,
          rangeEnd: selection.rangeEnd + delta,
        };
      }
      return null;
    })
    .filter((selection): selection is ComposerSkillSelection => selection !== null)
    .filter((selection) => isSelectionStillValid(input.nextPrompt, selection, matchedRanges))
    .toSorted((left, right) => left.rangeStart - right.rangeStart);
}

export function insertComposerSkillSelection(input: {
  previousPrompt: string;
  nextPrompt: string;
  selections: readonly ComposerSkillSelection[];
  insertedSelection: ComposerSkillSelection;
}): ComposerSkillSelection[] {
  const matchedRanges = new Set<string>();
  return [
    ...reconcileComposerSkillSelections({
      previousPrompt: input.previousPrompt,
      nextPrompt: input.nextPrompt,
      selections: input.selections,
    }),
    input.insertedSelection,
  ]
    .toSorted((left, right) => left.rangeStart - right.rangeStart)
    .filter((selection) => isSelectionStillValid(input.nextPrompt, selection, matchedRanges));
}

export function toCodexSkillReferencesForSend(
  selections: readonly ComposerSkillSelection[],
): Array<{ name: string; path: string }> {
  return selections.map(({ name, path }) => ({ name, path }));
}
