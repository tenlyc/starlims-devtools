import { create } from 'zustand';

export type Theme = 'dark' | 'light' | 'system';

interface ThemeState {
  theme: Theme;
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: Theme) => void;
  initTheme: () => Promise<void>;
}

const getSystemTheme = (): 'dark' | 'light' => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  resolvedTheme: 'dark',

  setTheme: (theme) => {
    const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
    set({ theme, resolvedTheme });

    // Apply theme to document
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(resolvedTheme);

    // Save preference
    if (window.electronAPI) {
      window.electronAPI.storeSet('theme', theme);
    }
  },

  initTheme: async () => {
    // Load saved theme
    let savedTheme: Theme | undefined;
    if (window.electronAPI) {
      savedTheme = await window.electronAPI.storeGet('theme') as Theme | undefined;
    }
    const theme = savedTheme || 'system';
    const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;

    set({ theme, resolvedTheme });

    // Apply theme to document
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(resolvedTheme);

    // Listen for system theme changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const { theme } = get();
        if (theme === 'system') {
          const newResolved = e.matches ? 'dark' : 'light';
          set({ resolvedTheme: newResolved });
          document.documentElement.classList.remove('dark', 'light');
          document.documentElement.classList.add(newResolved);
        }
      });
    }
  }
}));
