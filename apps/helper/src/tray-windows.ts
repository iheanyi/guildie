import { type ChildProcess, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

// A Windows notification-area icon, drawn by Windows' own PowerShell
// (System.Windows.Forms.NotifyIcon), so the helper needs no console window
// and ships no extra binaries. Protocol over the child's stdin/stdout:
//   to tray:   set <item> <1 enabled | 0 disabled | h hidden> <text>
//              tip <text>            balloon <title>|<text>
//   from tray: click <item>

const SCRIPT = String.raw`
param([string]$IconPath)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
try { [Console]::InputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:icon = New-Object System.Windows.Forms.NotifyIcon
try { $script:icon.Icon = New-Object System.Drawing.Icon($IconPath) } catch { $script:icon.Icon = [System.Drawing.SystemIcons]::Application }
$script:icon.Text = "guildie"
$script:menu = New-Object System.Windows.Forms.ContextMenuStrip
$script:items = @{}

function Emit([string]$msg) { [Console]::Out.WriteLine($msg); [Console]::Out.Flush() }

function Add-Item([string]$id, [string]$text, [bool]$enabled) {
	$item = New-Object System.Windows.Forms.ToolStripMenuItem($text)
	$item.Enabled = $enabled
	$item.Tag = $id
	$item.add_Click({ param($s, $e) Emit ("click " + $s.Tag) })
	[void]$script:menu.Items.Add($item)
	$script:items[$id] = $item
}

Add-Item "status" "guildie" $false
Add-Item "last" "No uploads yet" $false
[void]$script:menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
Add-Item "connect" "Connect to guildie..." $true
Add-Item "open" "Open guildie" $true
Add-Item "upload" "Upload now" $true
Add-Item "log" "Open log" $true
Add-Item "signout" "Sign out" $true
[void]$script:menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
Add-Item "quit" "Quit" $true

$script:icon.ContextMenuStrip = $script:menu
$script:icon.add_MouseClick({ param($s, $e) if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Emit "click open" } })
$script:icon.Visible = $true

$script:reader = [Console]::In
$script:pending = $script:reader.ReadLineAsync()
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.add_Tick({
	while ($script:pending.IsCompleted) {
		$line = $script:pending.Result
		if ($null -eq $line) {
			$script:icon.Visible = $false
			[System.Windows.Forms.Application]::Exit()
			return
		}
		$parts = $line.Split(" ", 4)
		switch ($parts[0]) {
			"set" {
				$it = $script:items[$parts[1]]
				if ($it) { $it.Visible = ($parts[2] -ne "h"); $it.Enabled = ($parts[2] -eq "1"); if ($parts.Length -gt 3) { $it.Text = $parts[3] } }
			}
			"tip" { $t = $line.Substring(4); if ($t.Length -gt 63) { $t = $t.Substring(0, 63) }; $script:icon.Text = $t }
			"balloon" {
				$bt = $line.Substring(8).Split("|", 2)
				$script:icon.ShowBalloonTip(6000, $bt[0], $bt[1], [System.Windows.Forms.ToolTipIcon]::Info)
			}
		}
		$script:pending = $script:reader.ReadLineAsync()
	}
})
$timer.Start()
[System.Windows.Forms.Application]::Run()
$script:icon.Dispose()
`;

export type TrayItem = "status" | "last" | "connect" | "open" | "upload" | "log" | "signout" | "quit";

export class WindowsTray {
	private child: ChildProcess;

	constructor(dir: string, iconPath: string, onClick: (item: TrayItem) => void, onExit: () => void) {
		const scriptPath = join(dir, "tray.ps1");
		writeFileSync(scriptPath, SCRIPT);
		this.child = spawn(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-STA", "-File", scriptPath, "-IconPath", iconPath],
			{ stdio: ["pipe", "pipe", "ignore"], windowsHide: true },
		);
		createInterface({ input: this.child.stdout! }).on("line", (line) => {
			const [kind, item] = line.trim().split(" ");
			if (kind === "click") onClick(item as TrayItem);
		});
		this.child.on("exit", onExit);
	}

	private send(line: string) {
		this.child.stdin?.write(`${line.replace(/[\r\n]+/g, " ")}\n`);
	}

	set(item: TrayItem, state: "enabled" | "disabled" | "hidden", text = "") {
		this.send(`set ${item} ${state === "enabled" ? "1" : state === "disabled" ? "0" : "h"} ${text}`);
	}

	tip(text: string) {
		this.send(`tip ${text}`);
	}

	balloon(title: string, text: string) {
		this.send(`balloon ${title}|${text}`);
	}

	close() {
		this.child.stdin?.end();
	}
}
