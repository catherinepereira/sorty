import { create } from "zustand";
import { api } from "../api";
import type { DatasetDetail, Item } from "../types";

interface DatasetStore {
  detail: DatasetDetail | null;
  loading: boolean;
  selected: Set<string>;

  load: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
  toggle: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  replaceItem: (item: Item) => void;
}

export const useDataset = create<DatasetStore>((set, get) => ({
  detail: null,
  loading: false,
  selected: new Set(),

  load: async (name) => {
    set({ loading: true, detail: null, selected: new Set() });
    const detail = await api.getDataset(name);
    set({ detail, loading: false });
  },

  refresh: async () => {
    const name = get().detail?.name;
    if (!name) return;
    const detail = await api.getDataset(name);
    const live = new Set(detail.items.map((i) => i.id));
    const selected = new Set([...get().selected].filter((id) => live.has(id)));
    set({ detail, selected });
  },

  toggle: (id) => {
    const selected = new Set(get().selected);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    set({ selected });
  },

  selectAll: () => {
    const items = get().detail?.items ?? [];
    set({ selected: new Set(items.map((i) => i.id)) });
  },

  clearSelection: () => set({ selected: new Set() }),

  replaceItem: (item) => {
    const detail = get().detail;
    if (!detail) return;
    set({
      detail: {
        ...detail,
        items: detail.items.map((i) => (i.id === item.id ? item : i)),
      },
    });
  },
}));
