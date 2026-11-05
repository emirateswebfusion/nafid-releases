# Keep update status visible until the new app confirms that its initial view is ready.
!macro customInit
  ${If} ${isUpdated}
    SetSilent normal
  ${EndIf}
!macroend

!macro customInstall
  Var /GLOBAL nafidUpdatePid
  Var /GLOBAL nafidUpdateMarker
  !ifdef RUN_AFTER_FINISH
    ${IfNot} ${Silent}
    ${OrIf} ${isForceRun}
      System::Call 'kernel32::GetCurrentProcessId() i .r0'
      StrCpy $nafidUpdatePid $0
      # Shell-launched apps can inherit a different TEMP from the installer. Use Nafid's canonical per-user path.
      SetShellVarContext current
      CreateDirectory "$APPDATA\Nafid"
      StrCpy $nafidUpdateMarker "$APPDATA\Nafid\nafid-update-$nafidUpdatePid.ready"
      ${If} $installMode == "all"
        SetShellVarContext all
      ${EndIf}
      Delete "$nafidUpdateMarker"
      SetDetailsPrint textonly
      DetailPrint "Installation complete. Starting Nafid..."
      SendMessage $hwndparent ${WM_SETTEXT} 0 "STR:Nafid - Starting application..."
      FindWindow $R3 "#32770" "" $hwndparent
      FindWindow $R3 "#32770" "" $hwndparent $R3
      GetDlgItem $R3 $R3 1000
      SendMessage $R3 ${WM_SETTEXT} 0 "STR:Starting Nafid. Please wait..."

      nafid_launch:
        ${StdUtils.ExecShellAsUser} $R2 "$appExe" "open" "--nafid-update-ready=$nafidUpdatePid"
        StrCmp $R2 "error" nafid_launch_failed
        StrCpy $R4 0
      nafid_wait_ready:
        IfFileExists "$nafidUpdateMarker" nafid_ready
        Sleep 250
        IntOp $R4 $R4 + 1
        IntCmp $R4 480 nafid_start_timeout nafid_wait_ready nafid_start_timeout
      nafid_start_timeout:
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Installation is complete, but Nafid has not confirmed it is ready. If Windows showed a Smart App Control or publisher warning, Retry will not resolve that block. Close this window and contact Nafid support for a trusted signed build. Otherwise, retry opening Nafid or open it from the desktop. Do not download the update again." IDRETRY nafid_launch
        !insertmacro quitSuccess
      nafid_launch_failed:
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Installation is complete, but Windows could not open Nafid. If Windows showed a Smart App Control or publisher warning, contact Nafid support for a trusted signed build. Otherwise, retry opening Nafid. Do not download the update again." IDRETRY nafid_launch
        !insertmacro quitSuccess
      nafid_ready:
        Delete "$nafidUpdateMarker"
        !insertmacro quitSuccess
    ${EndIf}
  !endif
!macroend
