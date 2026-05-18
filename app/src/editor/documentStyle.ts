export const documentStyleSlots = ["body", "heading1", "heading2", "heading3", "callout", "code"] as const;

export type DocumentStyleSlot = (typeof documentStyleSlots)[number];

export type DocumentTextStyle = {
  fontFamily: string;
  fontSize: string;
  color: string;
};

export type OpalineDocumentStyle = {
  version: 1;
  slots: Record<DocumentStyleSlot, DocumentTextStyle>;
};

export const DOCUMENT_STYLE_ATTR = "data-opaline-theme";
export const DOCUMENT_STYLE_CONFIG_ATTR = "data-opaline-style-config";

const systemFont = `system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif`;
const serifFont = `Georgia, "Times New Roman", "Noto Serif CJK SC", serif`;
const monoFont = `"SFMono-Regular", Consolas, "Liberation Mono", "Courier New", monospace`;
const cleanSansFont = `"Inter", "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;

export const documentFontFamilyOptions = [
  { id: "system", labelKey: "editor.styleFontSystem", value: systemFont },
  { id: "sans", labelKey: "editor.styleFontSans", value: cleanSansFont },
  { id: "serif", labelKey: "editor.styleFontSerif", value: serifFont },
  { id: "mono", labelKey: "editor.styleFontMono", value: monoFont },
] as const;

const allowedFontFamilies: Set<string> = new Set(documentFontFamilyOptions.map((option) => option.value));

const defaultSlots: Record<DocumentStyleSlot, DocumentTextStyle> = {
  body: { fontFamily: systemFont, fontSize: "16px", color: "#1d1d1f" },
  heading1: { fontFamily: systemFont, fontSize: "32px", color: "#1d1d1f" },
  heading2: { fontFamily: systemFont, fontSize: "23px", color: "#1d1d1f" },
  heading3: { fontFamily: systemFont, fontSize: "19px", color: "#1d1d1f" },
  callout: { fontFamily: systemFont, fontSize: "16px", color: "#1d1d1f" },
  code: { fontFamily: monoFont, fontSize: "14px", color: "#faf7f0" },
};

const slotCssNames: Record<DocumentStyleSlot, string> = {
  body: "body",
  heading1: "heading1",
  heading2: "heading2",
  heading3: "heading3",
  callout: "callout",
  code: "code",
};

const parser = new DOMParser();

export const createDefaultDocumentStyle = (): OpalineDocumentStyle => ({
  version: 1,
  slots: Object.fromEntries(
    documentStyleSlots.map((slot) => [slot, { ...defaultSlots[slot] }]),
  ) as Record<DocumentStyleSlot, DocumentTextStyle>,
});

export const normalizeDocumentStyle = (value: unknown): OpalineDocumentStyle => {
  const defaults = createDefaultDocumentStyle();
  if (!isRecord(value)) {
    return defaults;
  }

  const slots = isRecord(value.slots) ? value.slots : {};
  for (const slot of documentStyleSlots) {
    const patch = isRecord(slots[slot]) ? slots[slot] : {};
    defaults.slots[slot] = {
      fontFamily: normalizeFontFamily(patch.fontFamily, defaultSlots[slot].fontFamily),
      fontSize: normalizeFontSize(patch.fontSize, defaultSlots[slot].fontSize),
      color: normalizeColor(patch.color, defaultSlots[slot].color),
    };
  }

  return defaults;
};

export const updateDocumentStyleSlot = (
  style: OpalineDocumentStyle,
  slot: DocumentStyleSlot,
  patch: Partial<DocumentTextStyle>,
): OpalineDocumentStyle => {
  const normalized = normalizeDocumentStyle(style);
  normalized.slots[slot] = normalizeDocumentStyle({
    version: 1,
    slots: {
      ...normalized.slots,
      [slot]: {
        ...normalized.slots[slot],
        ...patch,
      },
    },
  }).slots[slot];
  return normalized;
};

export const documentStylesEqual = (left: OpalineDocumentStyle, right: OpalineDocumentStyle): boolean =>
  JSON.stringify(normalizeDocumentStyle(left)) === JSON.stringify(normalizeDocumentStyle(right));

export const isDefaultDocumentStyle = (style: OpalineDocumentStyle): boolean =>
  documentStylesEqual(style, createDefaultDocumentStyle());

export const documentStyleToCssVariables = (style: OpalineDocumentStyle): Record<string, string> => {
  const normalized = normalizeDocumentStyle(style);
  return Object.fromEntries(
    documentStyleSlots.flatMap((slot) => {
      const cssName = slotCssNames[slot];
      const value = normalized.slots[slot];
      return [
        [`--opaline-${cssName}-font-family`, value.fontFamily],
        [`--opaline-${cssName}-font-size`, value.fontSize],
        [`--opaline-${cssName}-color`, value.color],
      ];
    }),
  );
};

export const documentStyleToCss = (style: OpalineDocumentStyle): string => {
  const variables = documentStyleToCssVariables(style);
  const variableCss = Object.entries(variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");

  return `/* Opaline document style. Edit in Opaline to keep this block valid. */
:root {
${variableCss}
}

[data-opaline-note] {
  color: var(--opaline-body-color);
  font-family: var(--opaline-body-font-family);
  font-size: var(--opaline-body-font-size);
  line-height: 1.72;
}

[data-opaline-note] h1 {
  color: var(--opaline-heading1-color);
  font-family: var(--opaline-heading1-font-family);
  font-size: var(--opaline-heading1-font-size);
}

[data-opaline-note] h2 {
  color: var(--opaline-heading2-color);
  font-family: var(--opaline-heading2-font-family);
  font-size: var(--opaline-heading2-font-size);
}

[data-opaline-note] h3 {
  color: var(--opaline-heading3-color);
  font-family: var(--opaline-heading3-font-family);
  font-size: var(--opaline-heading3-font-size);
}

[data-opaline-note] [data-opaline-callout] {
  color: var(--opaline-callout-color);
  font-family: var(--opaline-callout-font-family);
  font-size: var(--opaline-callout-font-size);
}

[data-opaline-note] pre {
  overflow: auto;
  border-radius: 12px;
  background: #1d1d1f;
  color: var(--opaline-code-color);
  font-family: var(--opaline-code-font-family);
  font-size: var(--opaline-code-font-size);
  padding: 14px;
}

[data-opaline-note] pre code {
  color: inherit;
  font: inherit;
}`;
};

export const extractDocumentStyleFromHtml = (html: string): OpalineDocumentStyle => {
  const document = parser.parseFromString(html, "text/html");
  const styleElement = document.head.querySelector<HTMLStyleElement>(`style[${DOCUMENT_STYLE_ATTR}]`);
  const rawConfig = styleElement?.getAttribute(DOCUMENT_STYLE_CONFIG_ATTR);
  if (!rawConfig) {
    return createDefaultDocumentStyle();
  }

  try {
    return normalizeDocumentStyle(JSON.parse(rawConfig));
  } catch {
    return createDefaultDocumentStyle();
  }
};

export const upsertDocumentThemeStyle = (document: Document, style: OpalineDocumentStyle) => {
  document.head.querySelectorAll(`style[${DOCUMENT_STYLE_ATTR}]`).forEach((node) => node.remove());
  const normalized = normalizeDocumentStyle(style);
  if (isDefaultDocumentStyle(normalized)) {
    return;
  }

  const styleElement = document.createElement("style");
  styleElement.setAttribute(DOCUMENT_STYLE_ATTR, "");
  styleElement.setAttribute(DOCUMENT_STYLE_CONFIG_ATTR, JSON.stringify(normalized));
  styleElement.textContent = `\n${documentStyleToCss(normalized)}\n`;
  document.head.append(styleElement);
};

const normalizeFontFamily = (value: unknown, fallback: string): string =>
  typeof value === "string" && allowedFontFamilies.has(value) ? value : fallback;

const normalizeFontSize = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const match = value.trim().match(/^(\d{1,3})px$/);
  if (!match) {
    return fallback;
  }

  const size = Number(match[1]);
  if (!Number.isFinite(size) || size < 12 || size > 72) {
    return fallback;
  }
  return `${size}px`;
};

const normalizeColor = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const color = value.trim().toLowerCase();
  return /^#[\da-f]{6}$/.test(color) ? color : fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
