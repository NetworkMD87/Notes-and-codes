!macro customInstall
  WriteRegStr HKCU "Software\Classes\*\shell\NotesAndCodes" "" "Open with Notes & Codes"
  WriteRegStr HKCU "Software\Classes\*\shell\NotesAndCodes\command" "" '"$INSTDIR\Notes & Codes.exe" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\NotesAndCodes"
!macroend
