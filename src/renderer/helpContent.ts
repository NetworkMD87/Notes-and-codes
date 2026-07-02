export interface HelpEntry    { label: string; keys?: string; desc?: string }
export interface HelpCategory { title: string; entries: HelpEntry[] }
export interface HelpLink     { label: string; url: string }

export const APP_TAGLINE = 'Notepad-simple, code-editor-powerful.'

export const APP_LINKS: HelpLink[] = [
  { label: 'README',          url: 'https://github.com/NetworkMD87/Notes-and-codes#readme' },
  { label: 'GitHub repo',     url: 'https://github.com/NetworkMD87/Notes-and-codes' },
  { label: 'Report an issue', url: 'https://github.com/NetworkMD87/Notes-and-codes/issues' },
]

// `desc` is a plain-English, jargon-free explanation shown under the label when the
// Descriptions toggle is on. Only non-obvious / feature commands carry one; self-evident
// commands (Save, Copy, New Tab, Zoom…) are left without so the list stays uncluttered.
export const HELP_SECTIONS: HelpCategory[] = [
  { title: 'File', entries: [
    { label: 'New Tab',           keys: 'Ctrl+T' },
    { label: 'Open File…',        keys: 'Ctrl+O' },
    { label: 'Open Folder…',     keys: 'Ctrl+K', desc: 'Open a whole folder in a sidebar to work on a project.' },
    { label: 'Close Folder',      desc: 'Close the folder sidebar and go back to the simple scratchpad.' },
    { label: 'Save',              keys: 'Ctrl+S' },
    { label: 'Save As…',          keys: 'Ctrl+Shift+A' },
    { label: 'Save All',          keys: 'Ctrl+Shift+S', desc: 'Save every open tab at once.' },
    { label: 'Close Tab',         keys: 'Ctrl+W' },
    { label: 'Export to HTML…',   desc: 'Turn the current note (written in Markdown) into a web-page file.' },
    { label: 'Export to PDF…',    desc: 'Turn the current note (written in Markdown) into a PDF document.' },
    { label: 'Exit',              keys: 'Ctrl+Q' },
  ] },
  { title: 'Edit', entries: [
    { label: 'Undo',   keys: 'Ctrl+Z' },
    { label: 'Redo',   keys: 'Ctrl+Y' },
    { label: 'Cut',    keys: 'Ctrl+X' },
    { label: 'Copy',   keys: 'Ctrl+C' },
    { label: 'Paste',  keys: 'Ctrl+V' },
    { label: 'Select All', keys: 'Ctrl+A' },
    { label: 'Find',    keys: 'Ctrl+F', desc: 'Search for text in the current file.' },
    { label: 'Replace', keys: 'Ctrl+H', desc: 'Find text and swap it for something else.' },
    { label: 'Format Document',  keys: 'Shift+Alt+F', desc: 'Auto-tidy spacing and indentation so code is neatly laid out.' },
    { label: 'Format Selection', desc: 'Tidy just the highlighted part.' },
  ] },
  { title: 'View', entries: [
    { label: 'Toggle Split',          keys: 'Ctrl+\\', desc: 'Show two editors side by side.' },
    { label: 'Toggle Markdown Preview', desc: 'See formatted Markdown (headings, lists, links) as it will look.' },
    { label: 'Toggle Word Wrap',      desc: 'Wrap long lines so nothing runs off the right edge.' },
    { label: 'Toggle Line Numbers',   desc: 'Show or hide line numbers down the left side.' },
    { label: 'Toggle Sidebar',        desc: 'Show or hide the folder file-tree on the left.' },
    { label: 'Quick Open File',       keys: 'Ctrl+P', desc: 'Jump to any file in the folder by typing part of its name.' },
    { label: 'Reveal Active File in Sidebar', desc: 'Highlight the current file in the folder tree.' },
    { label: 'Zoom In',  keys: 'Ctrl+=' },
    { label: 'Zoom Out', keys: 'Ctrl+-' },
    { label: 'Reset Zoom', keys: 'Ctrl+0' },
    { label: 'Appearance…', desc: 'Change the theme, accent colour, and font.' },
    { label: 'Always on Top', desc: 'Keep the window above your other apps.' },
  ] },
  { title: 'Tools', entries: [
    { label: 'Diff: tab vs tab',            desc: 'Compare two open tabs and see what is different.' },
    { label: 'Diff: current vs clipboard',  desc: 'Compare this file with whatever you last copied.' },
    { label: 'Diff: two files',             desc: 'Pick two files on disk and compare them.' },
    { label: 'File History',                desc: 'Browse and restore earlier saved versions of this file.' },
    { label: 'Paste from History',          desc: 'Paste something you copied earlier — it keeps a list.' },
    { label: 'Insert Snippet',              desc: 'Drop in a saved, reusable chunk of text.' },
    { label: 'Save Selection as Snippet',   desc: 'Save the highlighted text to reuse later.' },
    { label: 'Manage Snippets',             desc: 'Add, rename, or delete your saved snippets.' },
    { label: 'Toggle Highlighter',          desc: 'Mark text with a coloured pen, like a highlighter.' },
    { label: 'Clear Highlights (current file)', desc: 'Remove all highlighter marks from this file.' },
    { label: 'Toggle "Open with Notes & Codes" right-click menu', desc: 'Add or remove this app from Windows’ right-click menu.' },
  ] },
  { title: 'Editor', entries: [
    { label: 'Command Palette (editor)', keys: 'F1', desc: 'The editor’s own built-in command list.' },
    { label: 'Go to Line',               keys: 'Ctrl+G', desc: 'Jump straight to a line number.' },
    { label: 'Add cursor above/below',   keys: 'Ctrl+Alt+↑/↓', desc: 'Type in several places at once.' },
    { label: 'Select next occurrence',   keys: 'Ctrl+D', desc: 'Grab the next copy of the current word to edit them together.' },
    { label: 'Column (box) select',      keys: 'Shift+Alt+drag', desc: 'Select a rectangular block of text.' },
    { label: 'Move line up/down',        keys: 'Alt+↑/↓', desc: 'Shift the current line without cut-and-paste.' },
    { label: 'Copy line up/down',        keys: 'Shift+Alt+↑/↓', desc: 'Duplicate the current line.' },
    { label: 'Indent / Outdent',         keys: 'Tab / Shift+Tab', desc: 'Push text right or left.' },
  ] },
  { title: 'Global', entries: [
    { label: 'Command Palette',          keys: 'Ctrl+Shift+P', desc: 'Search and run any command by name.' },
    { label: 'Summon / hide window (default; configurable)', keys: 'Ctrl+Shift+Space', desc: 'Show or hide the app from anywhere with one keypress.' },
    { label: 'Zoom',                    keys: 'Ctrl+scroll' },
  ] },
]
