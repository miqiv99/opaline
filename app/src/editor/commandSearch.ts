import type { EditorCommandUiEntry } from "./editorCommands";

export type LocalizeCommandText = (key: string) => string;

export const filterEditorCommandEntries = (
  entries: EditorCommandUiEntry[],
  query: string,
  t: LocalizeCommandText,
): EditorCommandUiEntry[] => {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return entries;
  }

  return entries.filter((entry) => {
    const haystack = normalizeSearchText([
      entry.entryId,
      entry.commandId,
      entry.labelKey,
      entry.descriptionKey,
      t(entry.labelKey),
      t(entry.descriptionKey),
      entry.category,
      entry.group,
    ].join(" "));
    return haystack.includes(normalized);
  });
};

export const normalizeSearchText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");
