import { useMemo } from "react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n";
import { filterEditorCommandEntries } from "./commandSearch";
import type { EditorCommandContext, EditorCommandUiEntry } from "./editorCommands";

export type SlashCommandState = {
  triggerFrom: number;
  query: string;
  x: number;
  y: number;
  selectedIndex: number;
};

export function SlashCommandMenu({
  state,
  entries,
  commandContext,
  iconForEntry,
  onSelectIndex,
  onRun,
}: {
  state: SlashCommandState | null;
  entries: EditorCommandUiEntry[];
  commandContext: EditorCommandContext;
  iconForEntry: (entry: EditorCommandUiEntry) => ReactNode;
  onSelectIndex: (index: number) => void;
  onRun: (entry: EditorCommandUiEntry) => void;
}) {
  const { t } = useI18n();
  const visibleEntries = useMemo(
    () => filterEditorCommandEntries(entries, state?.query ?? "", t).filter((entry) => entry.canRun(commandContext)).slice(0, 12),
    [commandContext, entries, state?.query, t],
  );

  if (!state) return null;

  const selectedIndex = Math.min(state.selectedIndex, Math.max(0, visibleEntries.length - 1));

  return (
    <div className="slash-command-menu" style={{ left: state.x, top: state.y }} role="listbox" aria-label={t("editor.slashMenu")}>
      <div className="slash-command-kicker">{t("editor.slashMenuHint")}</div>
      {visibleEntries.map((entry, index) => (
        <button
          key={entry.entryId}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          className={index === selectedIndex ? "slash-command-item is-selected" : "slash-command-item"}
          onMouseEnter={() => onSelectIndex(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            onRun(entry);
          }}
        >
          <span className="slash-command-icon">{iconForEntry(entry)}</span>
          <span>
            <strong>{t(entry.labelKey)}</strong>
            <small>{t(entry.descriptionKey)}</small>
          </span>
        </button>
      ))}
      {!visibleEntries.length ? <p className="slash-command-empty">{t("editor.slashMenuEmpty")}</p> : null}
    </div>
  );
}

export const selectedSlashCommandEntry = (
  state: SlashCommandState | null,
  entries: EditorCommandUiEntry[],
  commandContext: EditorCommandContext,
  t: (key: string) => string,
): EditorCommandUiEntry | null => {
  if (!state) return null;
  const visibleEntries = filterEditorCommandEntries(entries, state.query, t)
    .filter((entry) => entry.canRun(commandContext))
    .slice(0, 12);
  return visibleEntries[Math.min(state.selectedIndex, Math.max(0, visibleEntries.length - 1))] ?? null;
};
