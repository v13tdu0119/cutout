# Copies Cutout to D:\The Product\my tool and puts a desktop shortcut
# in a Desktop folder named "my tool".
# Run in PowerShell from the project folder:
#   powershell -ExecutionPolicy Bypass -File windows\Install-Cutout.ps1

$ErrorActionPreference = "Stop"

$source = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dest = "D:\The Product\my tool"
$desktopFolder = Join-Path ([Environment]::GetFolderPath("Desktop")) "my tool"

Write-Host "Installing Cutout"
Write-Host "  from $source"
Write-Host "  to   $dest"

New-Item -ItemType Directory -Force -Path $dest | Out-Null
New-Item -ItemType Directory -Force -Path $desktopFolder | Out-Null

$skip = [System.Collections.Generic.HashSet[string]]::new(
  [string[]]@("node_modules", ".next", ".git", "terminals", "coverage")
)

function Copy-Tree($from, $to) {
  New-Item -ItemType Directory -Force -Path $to | Out-Null
  Get-ChildItem -Force -LiteralPath $from | ForEach-Object {
    if ($skip.Contains($_.Name)) { return }
    $target = Join-Path $to $_.Name
    if ($_.PSIsContainer) {
      Copy-Tree $_.FullName $target
    } else {
      Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }
  }
}

Copy-Tree $source $dest

Copy-Item -Force (Join-Path $PSScriptRoot "Cutout.bat") (Join-Path $dest "Cutout.bat")
Copy-Item -Force (Join-Path $PSScriptRoot "Start-Cutout.vbs") (Join-Path $dest "Start-Cutout.vbs")
Copy-Item -Force (Join-Path $PSScriptRoot "cutout.ico") (Join-Path $dest "cutout.ico")

$icon = Join-Path $dest "cutout.ico"
$launcher = Join-Path $dest "Start-Cutout.vbs"
$shortcutPath = Join-Path $desktopFolder "Cutout.lnk"

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $dest
$shortcut.WindowStyle = 7
$shortcut.Description = "Cutout — U-Net background removal"
$shortcut.IconLocation = "$icon,0"
$shortcut.Save()

Write-Host ""
Write-Host "Done."
Write-Host "App folder:  $dest"
Write-Host "Desktop icon: $shortcutPath"
Write-Host ""
Write-Host "Double-click Cutout on the desktop. First launch installs Node packages and builds the app (internet once). After that it works offline."
