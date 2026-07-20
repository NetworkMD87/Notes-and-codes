!macro customInstall
  WriteRegStr HKCU "Software\Classes\*\shell\NotesAndCodes" "" "Open with Notes & Codes"
  WriteRegStr HKCU "Software\Classes\*\shell\NotesAndCodes\command" "" '"$INSTDIR\Notes & Codes.exe" "%1"'
  ; Icon must be written HERE too, not only by src/main/contextMenu.ts. The app's startup
  ; re-apply is gated on Settings.contextMenuEnabled, which defaults to FALSE — so on a fresh
  ; install nothing would ever add it and the menu entry would show a blank icon forever.
  ; Keep this value identical to buildContextMenuPlan()'s `icon` field.
  WriteRegStr HKCU "Software\Classes\*\shell\NotesAndCodes" "Icon" '"$INSTDIR\Notes & Codes.exe",0'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\NotesAndCodes"
!macroend
