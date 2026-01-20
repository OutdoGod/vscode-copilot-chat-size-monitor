# Copilot Chat Size Monitor

A VS Code extension that monitors GitHub Copilot Chat session sizes in real-time, helping developers avoid data loss from oversized chat exports.

## The Problem

GitHub Copilot Chat sessions in VS Code can grow to 500+ MB during extended development sessions. When sessions exceed approximately 500 MB:

- **Exports may silently truncate** - You lose conversation content without warning
- **"Invalid string length" errors** - Export fails completely
- **No built-in warning** - VS Code provides no indication you are approaching the limit

**Real-world data:** We confirmed data loss at 512 MB and safe exports up to 452 MB.

## The Solution

This extension adds a status bar indicator showing your active chat title and size, with color-coded warnings as you approach dangerous territory.

## Features

### Status Bar Indicator

The status bar shows your currently active chat:

- **Pencil icon** = Chat is actively growing (you are typing in this chat)
- **Chat icon** = Chat is idle (no recent size changes)
- **Title** = Auto-generated chat title (first 20 characters)
- **Size** = Current file size in MB
- **Indicator** = Color-coded safety status

### Visual Thresholds

| Indicator | Size Range | Meaning |
|-----------|------------|---------|
| Green | < 300 MB | Safe - Continue chatting |
| Yellow | 300-450 MB | Caution - Consider exporting soon |
| Red | > 450 MB | Danger - Export immediately! |

### Quick Pick Menu (Click Status Bar)

Click the status bar to see your **top 5 recent chats** with:
- Chat titles extracted from session files
- Size in MB with color indicator
- Growth status (actively growing vs idle)
- Workspace hash for identification
- Time since last modification

### Threshold Notifications

Automatic alerts when any chat crosses danger thresholds:

- **Caution (300 MB):** Consider exporting soon
- **Danger (450 MB):** Export now to avoid data loss!

### Growth Detection

The extension tracks which chats are actively growing (receiving new content), helping you identify which conversation you are currently working in.

### Automatic Title Extraction

Chat titles are automatically extracted from the session file generatedTitle field - the same title Copilot shows in the Sessions panel.

## Installation

### From VSIX (Recommended)

1. Download the latest .vsix from [Releases](https://github.com/OutdoGod/vscode-copilot-chat-size-monitor/releases)
2. Install via command line:
   ```bash
   code --install-extension copilot-chat-monitor-0.1.0.vsix
   ```

### Build from Source

```bash
git clone https://github.com/OutdoGod/vscode-copilot-chat-size-monitor.git
cd vscode-copilot-chat-size-monitor
npm install
npm run compile
npm run package
code --install-extension copilot-chat-monitor-0.1.0.vsix
```

### Development Mode

1. Open the extension folder in VS Code
2. Press F5 to launch Extension Development Host
3. The status bar will show the chat size indicator

## Configuration

Access via: Settings > Extensions > Copilot Chat Monitor

| Setting | Default | Description |
|---------|---------|-------------|
| copilotChatMonitor.cautionThresholdMB | 300 | Size in MB to show caution indicator |
| copilotChatMonitor.dangerThresholdMB | 450 | Size in MB to show danger indicator |

## Commands

Access via Command Palette (Cmd+Shift+P / Ctrl+Shift+P):

| Command | Description |
|---------|-------------|
| Copilot Chat Monitor: Refresh Size | Manually refresh all session sizes |
| Copilot Chat Monitor: Show Options | Open the quick pick menu |

## How It Works

### Session Storage Locations

| Platform | Path |
|----------|------|
| macOS | ~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/*.json |
| Windows | %APPDATA%/Code/User/workspaceStorage/*/chatSessions/*.json |
| Linux | ~/.config/Code/User/workspaceStorage/*/chatSessions/*.json |

### Monitoring Behavior

1. **File Watching**: Uses VS Code FileSystemWatcher to detect changes in real-time
2. **Growth Detection**: Compares current size to previous size to identify active chats
3. **Title Extraction**: Reads only the first 5KB of each file to extract generatedTitle
4. **Caching**: Titles are cached permanently (they never change after creation)
5. **Cross-Workspace**: Monitors ALL workspaces, not just the current one

### Performance

- **Memory**: Titles cached in memory (~1KB per chat)
- **Disk I/O**: Only reads first 5KB of each file for title extraction
- **CPU**: Negligible - only processes on file change events

## Threshold Recommendations

Based on empirical testing with 27 exported chat sessions:

| Size | Risk Level | Recommendation |
|------|------------|----------------|
| < 300 MB | Low | Continue working normally |
| 300-400 MB | Medium | Plan to export within the session |
| 400-450 MB | High | Export at next natural break point |
| 450-480 MB | Critical | Export immediately |
| > 480 MB | Dangerous | Export NOW - data loss likely |

**Evidence:**
- Safe exports confirmed: 452 MB, 489 MB, 496 MB
- Data loss confirmed: 512 MB

## Troubleshooting

### Extension not showing in status bar

1. Check if extension is installed: Extensions panel > Search "Copilot Chat Monitor"
2. Try reloading: Cmd+Shift+P > Developer: Reload Window
3. Check Output panel for errors: View > Output > Select "Copilot Chat Monitor"

### Wrong chat showing as active

The extension identifies active chats by size growth, not VS Code focus. Click the status bar to see all recent chats.

### Status bar shows old/wrong size

Click Refresh in the quick pick menu, or run command "Copilot Chat Monitor: Refresh Size"

## Contributing

Contributions welcome! See IDEA_BACKLOG.md for planned features.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE for details.

## Acknowledgments

- Built to solve a real problem experienced during extended Copilot Chat sessions
- Inspired by the lack of any built-in size monitoring in VS Code
- Threshold values derived from empirical testing, not documentation (because there is none)

---

**Made with love to prevent chat data loss**

*If this extension saved your conversation, consider starring the repo!*
