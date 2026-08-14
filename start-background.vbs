Set WshShell = CreateObject("WScript.Shell")

projectPath = "C:\Users\Administrator\Desktop\waitech-auto-publisher"

WshShell.CurrentDirectory = projectPath

WshShell.Run "cmd.exe /c node scheduler.js >> scheduler.log 2>&1", 0, False

Set WshShell = Nothing