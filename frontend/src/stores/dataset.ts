import { create } from "zustand";
import { api } from "../api";
import type { DatasetDetail, Item } from "../types";

interface DatasetStore {
  detail: DatasetDetail | null;
  loading: boolean;
  selected: Set<string>;
  selectMode: boolean;

  load: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
  toggle: (id: string) => void;
  setSelected: (id: string, on: boolean) => void;
  clearSelection: () => void;
  setSelectMode: (on: boolean) => void;
  replaceItem: (item: Item) => void;
}

export const useDataset = create<DatasetStore>((set, get) => ({
  detail: null,
  loading: false,
  selected: new Set(),
  selectMode: false,

  load: async (name) => {
    set({
      loading: true,
      detail: null,
      selected: new Set(),
      selectMode: false,
    });
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

  setSelected: (id, on) => {
    const selected = new Set(get().selected);
    if (on) selected.add(id);
    else selected.delete(id);
    set({ selected });
  },

  clearSelection: () => set({ selected: new Set() }),

  setSelectMode: (on) =>
    set({ selectMode: on, selected: on ? get().selected : new Set() }),

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
