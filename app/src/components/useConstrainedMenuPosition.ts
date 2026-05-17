import { useLayoutEffect, useState } from "react";
import type { CSSProperties, RefObject } from "react";

type MenuAnchor = {
  x: number;
  y: number;
} | null;

const VIEWPORT_GAP = 8;

export const useConstrainedMenuPosition = (
  anchor: MenuAnchor,
  menuRef: RefObject<HTMLElement>,
): CSSProperties => {
  const [style, setStyle] = useState<CSSProperties>(() => ({
    left: anchor?.x ?? 0,
    top: anchor?.y ?? 0,
    visibility: "hidden",
  }));

  useLayoutEffect(() => {
    if (!anchor) {
      return;
    }

    const menu = menuRef.current;
    if (!menu) {
      setStyle({
        left: anchor.x,
        top: anchor.y,
        visibility: "hidden",
      });
      return;
    }

    const rect = menu.getBoundingClientRect();
    const maxHeight = Math.max(120, window.innerHeight - VIEWPORT_GAP * 2);
    const maxWidth = Math.max(160, window.innerWidth - VIEWPORT_GAP * 2);
    const needsVerticalScroll = rect.height > maxHeight;
    const visibleHeight = Math.min(rect.height, maxHeight);
    const shouldFlipX =
      anchor.x + rect.width > window.innerWidth - VIEWPORT_GAP &&
      anchor.x - rect.width + VIEWPORT_GAP >= VIEWPORT_GAP;
    const shouldFlipY =
      anchor.y + visibleHeight > window.innerHeight - VIEWPORT_GAP &&
      anchor.y - visibleHeight + VIEWPORT_GAP >= VIEWPORT_GAP;
    const preferredLeft = shouldFlipX ? anchor.x - rect.width + VIEWPORT_GAP : anchor.x;
    const preferredTop = shouldFlipY ? anchor.y - visibleHeight + VIEWPORT_GAP : anchor.y;
    const left = clamp(preferredLeft, VIEWPORT_GAP, window.innerWidth - rect.width - VIEWPORT_GAP);
    const top = clamp(preferredTop, VIEWPORT_GAP, window.innerHeight - visibleHeight - VIEWPORT_GAP);

    setStyle({
      left,
      top,
      maxHeight,
      maxWidth,
      overflowY: needsVerticalScroll ? "auto" : undefined,
      visibility: "visible",
    });
  }, [anchor, menuRef]);

  return style;
};

const clamp = (value: number, min: number, max: number) => {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
};
