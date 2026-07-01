export interface HelpEntry    { label: string; keys?: string }
export interface HelpCategory { title: string; entries: HelpEntry[] }
export interface HelpLink     { label: string; url: string }

export const APP_TAGLINE = 'Notepad-simple, code-editor-powerful.'

export const APP_LINKS: HelpLink[] = [
  { label: 'README',          url: 'https://github.com/NetworkMD87/Notes-and-codes#readme' },
  { label: 'GitHub repo',     url: 'https://github.com/NetworkMD87/Notes-and-codes' },
  { label: 'Report an issue', url: 'https://github.com/NetworkMD87/Notes-and-codes/issues' },
]

export const HELP_SECTIONS: HelpCategory[] = [
  { title: 'File', entries: [
    { label: 'New Tab',           keys: 'Ctrl+T' },
    { label: 'Open File…',        keys: 'Ctrl+O' },
    { label: 'Open Folder…',     keys: 'Ctrl+K' },
    { label: 'Close Folder' },
    { label: 'Save',              keys: 'Ctrl+S' },
    { label: 'Save As…',          keys: 'Ctrl+Shift+A' },
    { label: 'Save All',          keys: 'Ctrl+Shift+S' },
    { label: 'Close Tab',         keys: 'Ctrl+W' },
    { label: 'Export to HTML…' },
    { label: 'Export to PDF…' },
    { label: 'Exit',              keys: 'Ctrl+Q' },
  ] },
  { title: 'Edit', entries: [
    { label: 'Undo',   keys: 'Ctrl+Z' },
    { label: 'Redo',   keys: 'Ctrl+Y' },
    { label: 'Cut',    keys: 'Ctrl+X' },
    { label: 'Copy',   keys: 'Ctrl+C' },
    { label: 'Paste',  keys: 'Ctrl+V' },
    { label: 'Select All', keys: 'Ctrl+A' },
    { label: 'Find',    keys: 'Ctrl+F' },
    { label: 'Replace', keys: 'Ctrl+H' },
    { label: 'Format Document',  keys: 'Shift+Alt+F' },
    { label: 'Format Selection' },
  ] },
  { title: 'View', entries: [
    { label: 'Toggle Split',          keys: 'Ctrl+\\' },
    { label: 'Toggle Markdown Preview' },
    { label: 'Toggle Word Wrap' },
    { label: 'Toggle Line Numbers' },
    { label: 'Toggle Sidebar' },
    { label: 'Quick Open File',       keys: 'Ctrl+P' },
    { label: 'Reveal Active File in Sidebar' },
    { label: 'Zoom In',  keys: 'Ctrl+=' },
    { label: 'Zoom Out', keys: 'Ctrl+-' },
    { label: 'Reset Zoom', keys: 'Ctrl+0' },
    { label: 'Appearance…' },
    { label: 'Always on Top' },
  ] },
  { title: 'Tools', entries: [
    { label: 'Diff: tab vs tab' },
    { label: 'Diff: current vs clipboard' },
    { label: 'Diff: two files' },
    { label: 'File History' },
    { label: 'Paste from History' },
    { label: 'Insert Snippet' },
    { label: 'Save Selection as Snippet' },
    { label: 'Manage Snippets' },
    { label: 'Toggle Highlighter' },
    { label: 'Clear Highlights (current file)' },
    { label: 'Toggle "Open with Notes & Codes" right-click menu' },
  ] },
  { title: 'Editor', entries: [
    { label: 'Command Palette (editor)', keys: 'F1' },
    { label: 'Go to Line',               keys: 'Ctrl+G' },
    { label: 'Add cursor above/below',   keys: 'Ctrl+Alt+↑/↓' },
    { label: 'Select next occurrence',   keys: 'Ctrl+D' },
    { label: 'Column (box) select',      keys: 'Shift+Alt+drag' },
    { label: 'Move line up/down',        keys: 'Alt+↑/↓' },
    { label: 'Copy line up/down',        keys: 'Shift+Alt+↑/↓' },
    { label: 'Indent / Outdent',         keys: 'Tab / Shift+Tab' },
  ] },
  { title: 'Global', entries: [
    { label: 'Command Palette',          keys: 'Ctrl+Shift+P' },
    { label: 'Summon / hide window (default; configurable)', keys: 'Ctrl+Shift+Space' },
    { label: 'Zoom',                    keys: 'Ctrl+scroll' },
  ] },
]
