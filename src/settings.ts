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

export interface ViewPrefs {
  view: "grid" | "table";
  size: "s" | "m" | "l";
  // 0 shows every image on one page
  perPage: number;
}

const DEFAULT_VIEW: ViewPrefs = { view: "grid", size: "m", perPage: 96 };
const VIEW_KEY = "sorty.view";

export function getViewPrefs(): ViewPrefs {
  try {
    return {
      ...DEFAULT_VIEW,
      ...JSON.parse(localStorage.getItem(VIEW_KEY) || "{}"),
    };
  } catch {
    return { ...DEFAULT_VIEW };
  }
}

export function setViewPrefs(prefs: ViewPrefs) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota or privacy-mode errors, the prefs won't persist
  }
}
