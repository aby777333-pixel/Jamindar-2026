import { create } from "zustand";

const MAX = 3;

interface CompareState {
  ids: string[];
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
  atLimit: () => boolean;
}

/** Shortlist of properties (up to 3) to compare side by side. */
export const useCompare = create<CompareState>((set, get) => ({
  ids: [],
  toggle: (id) =>
    set((s) => {
      if (s.ids.includes(id)) return { ids: s.ids.filter((x) => x !== id) };
      if (s.ids.length >= MAX) return s; // ignore beyond the limit
      return { ids: [...s.ids, id] };
    }),
  remove: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),
  clear: () => set({ ids: [] }),
  has: (id) => get().ids.includes(id),
  atLimit: () => get().ids.length >= MAX,
}));

export const COMPARE_MAX = MAX;
