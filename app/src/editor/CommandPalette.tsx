import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n";
import { filterEditorCommandEntries } from "./commandSearch";
import type { EditorCommandContext, EditorCommandUiEntry } from "./editorCommands";

export function CommandPalette({
  open,
  entries,
  commandContext,
  shortcutForEntry,
  iconForEntry,
  onRun,
  onClose,
}: {
  open: boolean;
  entries: EditorCommandUiEntry[];
  commandContext: EditorCommandContext;
  shortcutForEntry: (entry: EditorCommandUiEntry) => string;
  iconForEntry: (entry: EditorCommandUiEntry) => ReactNode;
  onRun: (entry: EditorCommandUiEntry) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visibleEntries = useMemo(
    () => filterEditorCommandEntries(entries, query, t).filter((entry) => entry.canRun(commandContext)),
    [commandContext, entries, query, t],
  );
  const selected = visibleEntries[Math.min(selectedIndex, Math.max(0, visibleEntries.length - 1))];

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" role="dialog" aria-modal="true" aria-label={t("editor.commandPalette")}>
      <div className="command-palette-card">
        <label className="command-palette-search">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("editor.commandPalettePlaceholder")}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((index) => Math.min(index + 1, Math.max(0, visibleEntries.length - 1)));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((index) => Math.max(0, index - 1));
              }
              if (event.key === "Enter" && selected) {
                event.preventDefault();
                onRun(selected);
              }
            }}
          />
        </label>
        <div className="command-palette-list" role="listbox" aria-label={t("editor.commandPaletteResults")}>
          {visibleEntries.map((entry, index) => {
            const shortcut = shortcutForEntry(entry);
            return (
              <button
                key={entry.entryId}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                className={index === selectedIndex ? "command-option is-selected" : "command-option"}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => onRun(entry)}
              >
                <span className="command-option-icon">{iconForEntry(entry)}</span>
                <span className="command-option-copy">
                  <strong>{t(entry.labelKey)}</strong>
                  <small>{t(entry.descriptionKey)}</small>
                </span>
                {shortcut ? <kbd>{shortcut}</kbd> : null}
              </button>
            );
          })}
          {!visibleEntries.length ? <p className="command-empty">{t("editor.commandPaletteEmpty")}</p> : null}
        </div>
      </div>
    </div>
  );
}
