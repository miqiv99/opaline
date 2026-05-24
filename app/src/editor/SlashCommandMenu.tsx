import { useEffect, useMemo, useRef } from "react";
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
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const visibleEntries = useMemo(
    () => visibleSlashCommandEntries(state, entries, commandContext, t),
    [commandContext, entries, state?.query, t],
  );

  const selectedIndex = state ? Math.min(state.selectedIndex, Math.max(0, visibleEntries.length - 1)) : 0;

  useEffect(() => {
    if (!state) return;
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, state, visibleEntries.length]);

  if (!state) return null;

  return (
    <div className="slash-command-menu" style={{ left: state.x, top: state.y }} role="listbox" aria-label={t("editor.slashMenu")}>
      <div className="slash-command-kicker">{t("editor.slashMenuHint")}</div>
      {visibleEntries.map((entry, index) => (
        <button
          key={entry.entryId}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
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
  const visibleEntries = visibleSlashCommandEntries(state, entries, commandContext, t);
  return visibleEntries[Math.min(state.selectedIndex, Math.max(0, visibleEntries.length - 1))] ?? null;
};

export const visibleSlashCommandEntries = (
  state: SlashCommandState | null,
  entries: EditorCommandUiEntry[],
  commandContext: EditorCommandContext,
  t: (key: string) => string,
): EditorCommandUiEntry[] =>
  filterEditorCommandEntries(entries, state?.query ?? "", t).filter((entry) => entry.canRun(commandContext));
