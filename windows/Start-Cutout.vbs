' Starts Cutout without a visible command window.
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
bat = folder & "\Cutout.bat"
Set sh = CreateObject("Wscript.Shell")
sh.CurrentDirectory = folder
sh.Run """" & bat & """", 0, False
