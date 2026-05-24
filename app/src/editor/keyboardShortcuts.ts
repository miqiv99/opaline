import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export type ShortcutActionId =
  | "save"
  | "bold"
  | "italic"
  | "underline"
  | "webLink"
  | "heading1"
  | "heading2"
  | "heading3"
  | "orderedList"
  | "bulletList";

export type KeyboardShortcut = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
  code?: string;
};

export type EditorShortcutSettings = Record<ShortcutActionId, KeyboardShortcut>;

export const shortcutActions: Array<{
  id: ShortcutActionId;
  labelKey: string;
  descriptionKey: string;
}> = [
  { id: "save", labelKey: "shortcut.action.save", descriptionKey: "shortcut.action.saveDesc" },
  { id: "bold", labelKey: "editor.bold", descriptionKey: "shortcut.action.boldDesc" },
  { id: "italic", labelKey: "editor.italic", descriptionKey: "shortcut.action.italicDesc" },
  { id: "underline", labelKey: "editor.underline", descriptionKey: "shortcut.action.underlineDesc" },
  { id: "webLink", labelKey: "editor.webLink", descriptionKey: "shortcut.action.webLinkDesc" },
  { id: "heading1", labelKey: "editor.heading1", descriptionKey: "shortcut.action.heading1Desc" },
  { id: "heading2", labelKey: "editor.heading2", descriptionKey: "shortcut.action.heading2Desc" },
  { id: "heading3", labelKey: "editor.heading3", descriptionKey: "shortcut.action.heading3Desc" },
  { id: "orderedList", labelKey: "editor.orderedList", descriptionKey: "shortcut.action.orderedListDesc" },
  { id: "bulletList", labelKey: "editor.bulletList", descriptionKey: "shortcut.action.bulletListDesc" },
];

export const defaultEditorShortcutSettings: EditorShortcutSettings = {
  save: { ctrl: true, alt: false, shift: false, key: "s", code: "KeyS" },
  bold: { ctrl: true, alt: false, shift: false, key: "b", code: "KeyB" },
  italic: { ctrl: true, alt: false, shift: false, key: "i", code: "KeyI" },
  underline: { ctrl: true, alt: false, shift: false, key: "u", code: "KeyU" },
  webLink: { ctrl: true, alt: false, shift: false, key: "k", code: "KeyK" },
  heading1: { ctrl: true, alt: true, shift: false, key: "1", code: "Digit1" },
  heading2: { ctrl: true, alt: true, shift: false, key: "2", code: "Digit2" },
  heading3: { ctrl: true, alt: true, shift: false, key: "3", code: "Digit3" },
  orderedList: { ctrl: true, alt: false, shift: true, key: "7", code: "Digit7" },
  bulletList: { ctrl: true, alt: false, shift: true, key: "8", code: "Digit8" },
};

export const normalizeShortcutSettings = (value: unknown): EditorShortcutSettings => {
  const source = isRecord(value) ? value : {};
  const normalized = { ...defaultEditorShortcutSettings };
  for (const action of shortcutActions) {
    normalized[action.id] = normalizeShortcut(source[action.id], defaultEditorShortcutSettings[action.id]);
  }
  return normalized;
};

export const shortcutSignature = (shortcut: KeyboardShortcut): string =>
  [
    shortcut.ctrl ? "Ctrl" : "",
    shortcut.alt ? "Alt" : "",
    shortcut.shift ? "Shift" : "",
    shortcut.code || shortcut.key.toUpperCase(),
  ].filter(Boolean).join("+");

export const formatShortcut = (shortcut: KeyboardShortcut): string => {
  const parts = [
    shortcut.ctrl ? "Ctrl" : "",
    shortcut.alt ? "Alt" : "",
    shortcut.shift ? "Shift" : "",
    shortcutLabelKey(shortcut),
  ].filter(Boolean);
  return parts.join("+");
};

export const shortcutConflicts = (settings: EditorShortcutSettings): Array<[ShortcutActionId, ShortcutActionId]> => {
  const seen = new Map<string, ShortcutActionId>();
  const conflicts: Array<[ShortcutActionId, ShortcutActionId]> = [];
  for (const action of shortcutActions) {
    const signature = shortcutSignature(settings[action.id]);
    const existing = seen.get(signature);
    if (existing) {
      conflicts.push([existing, action.id]);
    } else {
      seen.set(signature, action.id);
    }
  }
  return conflicts;
};

export const shortcutFromKeyboardEvent = (event: KeyboardEvent | ReactKeyboardEvent): KeyboardShortcut | null => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === "Control" || key === "Meta" || key === "Alt" || key === "Shift") {
    return null;
  }

  const ctrl = event.ctrlKey || event.metaKey;
  if (!ctrl) {
    return null;
  }

  return {
    ctrl,
    alt: event.altKey,
    shift: event.shiftKey,
    key,
    code: event.code || undefined,
  };
};

export const keyboardShortcutMatches = (event: KeyboardEvent, shortcut: KeyboardShortcut): boolean => {
  const ctrlMatches = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
  const altMatches = event.altKey === shortcut.alt;
  const shiftMatches = event.shiftKey === shortcut.shift;
  const keyMatches = shortcut.code ? event.code === shortcut.code : event.key.toLowerCase() === shortcut.key.toLowerCase();
  return ctrlMatches && altMatches && shiftMatches && keyMatches;
};

const normalizeShortcut = (value: unknown, fallback: KeyboardShortcut): KeyboardShortcut => {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  const key = typeof value.key === "string" && value.key.trim() ? value.key.trim() : fallback.key;
  const code = typeof value.code === "string" && value.code.trim() ? value.code.trim() : fallback.code;
  return {
    ctrl: value.ctrl === false ? false : true,
    alt: value.alt === true,
    shift: value.shift === true,
    key: key.length === 1 ? key.toLowerCase() : key,
    code,
  };
};

const shortcutLabelKey = (shortcut: KeyboardShortcut): string => {
  if (shortcut.code?.startsWith("Digit")) {
    return shortcut.code.slice("Digit".length);
  }
  if (shortcut.code?.startsWith("Key")) {
    return shortcut.code.slice("Key".length);
  }
  if (shortcut.key === " ") {
    return "Space";
  }
  return shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
