// Theme id + label metadata — pure data, no monaco / DOM imports. Lives in `shared` so the
// MAIN process (`src/main/menu.ts`, which builds the Theme submenu) can consume it without
// importing a renderer module — that import worked only because `renderer/themes.ts`'s
// monaco import is type-only today, and would break the main build the moment it grows a
// real monaco/DOM import (the process-boundary rule, CLAUDE.md).
//
// This list is the source of truth for the id/label pairs shown in the menu + Appearance
// panel. The renderer's full `ThemeDef`s (with monaco theme data) stay in
// `src/renderer/themes.ts`; `tests/unit/sharedThemes.test.ts` guards that this list stays
// aligned with them (a theme added to `THEMES` but not here — or a label typo — fails CI).
export interface ThemeMeta { id: string; label: string }

export const THEME_LIST: ThemeMeta[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'dark-dimmed', label: 'Dark Dimmed' },
  { id: 'solarized-dark', label: 'Solarized Dark' },
  { id: 'one-dark', label: 'One Dark' },
  { id: 'solarized-light', label: 'Solarized Light' },
  { id: 'monokai', label: 'Monokai' },
  { id: 'high-contrast', label: 'High Contrast' },
  { id: 'nord', label: 'Nord' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark' },
  { id: 'tokyo-night', label: 'Tokyo Night' },
  { id: 'gruvbox-light', label: 'Gruvbox Light' },
  { id: 'follow-os', label: 'Follow OS' }
]
