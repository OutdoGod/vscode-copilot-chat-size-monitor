# Copilot Chat Size Monitor

A lightweight VS Code extension that monitors GitHub Copilot Chat session file sizes in real-time and displays status in the editor's status bar with threshold-based warnings.

## Why?

- VS Code Copilot Chat sessions can grow to 500+ MB
- Exports above ~500 MB may silently truncate or fail with "Invalid string length"
- No built-in warning system exists
- This extension provides real-time visibility to prevent data loss

## Features

- **Status Bar Indicator:** Shows your active (most recently modified) chat session size in MB
- **Visual Thresholds:**
  - ✅ Safe (< 300 MB)
  - ⚠️ Caution (300-450 MB)
  - ❌ Danger (> 450 MB)
- **Real-time Updates:** File watcher detects changes automatically
- **Click Actions:** Quick access to export, refresh, and settings
- **Notifications:** Alerts when crossing danger threshold

## Installation

### From VSIX (Local)

1. Build the extension:
   ```bash
   cd ~/Documents/codegym/vscode-copilot-chat-monitor
   npm install
   npm run compile
   npm run package
   ```

2. Install:
   ```bash
   code --install-extension copilot-chat-monitor-0.1.0.vsix
   ```

### Development

1. Open the extension folder in VS Code
2. Press F5 to launch Extension Development Host
3. The status bar will show the chat size indicator

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `copilotChatMonitor.cautionThresholdMB` | 300 | Size in MB for caution indicator |
| `copilotChatMonitor.dangerThresholdMB` | 450 | Size in MB for danger indicator |

## Commands

- `Copilot Chat Monitor: Refresh Size` - Manually refresh the size display
- `Copilot Chat Monitor: Show Options` - Open quick actions menu

## Technical Details

Monitors chat session files stored in:
- **macOS:** `~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/*.json`
- **Windows:** `%APPDATA%/Code/User/workspaceStorage/*/chatSessions/*.json`
- **Linux:** `~/.config/Code/User/workspaceStorage/*/chatSessions/*.json`

The extension watches ALL workspace session files and reports the most recently modified one (your active chat session).

## Thresholds

Based on empirical testing:
- **Safe:** < 300 MB - No action needed
- **Caution:** 300-450 MB - Consider exporting soon
- **Danger:** > 450 MB - Export immediately to avoid data loss

Confirmed data loss observed at 512 MB. Safe exports confirmed up to 452 MB.

## License

MIT
