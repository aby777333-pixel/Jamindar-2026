import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { getThemeMode, setThemeMode, type ThemeMode } from "./theme";

const KEY = "jamin.themeMode";

/**
 * Appearance preference.
 *
 * Light is the default and stays the default — dark is only ever applied
 * because the member chose it, never because the phone is in dark mode. The
 * choice survives restarts.
 *
 * `setThemeMode` is called BEFORE the store's state updates so that when React
 * re-renders, every `colors.x` read in the tree already resolves against the
 * new palette. The root then remounts on `mode`, which is what makes ~2,035
 * existing colour reads repaint without any of them being touched.
 */
type ThemeState = {
  mode: ThemeMode;
  ready: boolean;
  hydrate: () => Promise<void>;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

export const useTheme = create<ThemeState>((set, get) => ({
  mode: getThemeMode(),
  ready: false,
  hydrate: async () => {
    try {
      const saved = await AsyncStorage.getItem(KEY);
      if (saved === "dark" || saved === "light") {
        setThemeMode(saved);
        set({ mode: saved });
      }
    } catch {
      /* a missing preference just means light */
    } finally {
      set({ ready: true });
    }
  },
  setMode: (mode) => {
    setThemeMode(mode);
    set({ mode });
    AsyncStorage.setItem(KEY, mode).catch(() => {});
  },
  toggle: () => get().setMode(get().mode === "dark" ? "light" : "dark"),
}));
