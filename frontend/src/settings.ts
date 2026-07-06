export interface Hotkeys {
  valid: string;
  unreviewed: string;
}

export const DEFAULT_HOTKEYS: Hotkeys = { unreviewed: "1", valid: "2" };

const KEY = "sorty.hotkeys";

export function getHotkeys(): Hotkeys {
  try {
    return {
      ...DEFAULT_HOTKEYS,
      ...JSON.parse(localStorage.getItem(KEY) || "{}"),
    };
  } catch {
    return { ...DEFAULT_HOTKEYS };
  }
}

export function setHotkeys(hotkeys: Hotkeys) {
  localStorage.setItem(KEY, JSON.stringify(hotkeys));
}
