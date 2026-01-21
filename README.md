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

---

## Features Overview

| Feature | Description |
|---------|-------------|
| **Status Bar** | Real-time display of active chat with size indicator |
| **Quick Pick Menu** | Top 5 recent chats with detailed status |
| **Growth Detection** | Identifies actively growing chats (15-second window) |
| **Workspace Filtering** | Only shows chats from current workspace |
| **Empty Session Filtering** | Hides abandoned/empty chat sessions |
| **Threshold Alerts** | Automatic warnings at caution/danger levels |

---

## Status Bar Indicator

The status bar (bottom right) shows your most recent or most important chat.

### Status Bar Format

```
📝 VS Code Extension for... 107MB ✅
```

### Status Bar Components

| Component | Description |
|-----------|-------------|
| **Icon** | 📝 = Growing (size increased in last 15s), 💬 = Idle |
| **Title** | First 20 characters of chat title |
| **Size** | Current file size in MB |
| **Indicator** | ✅ Safe, ⚠️ Caution, ❌ Danger |

### Status Bar Priority Logic

The status bar displays chats in this priority order:

1. **Growing chat** - Any chat actively receiving new content (highest priority)
2. **Largest at-risk chat** - Any chat ≥ 300 MB (caution threshold)
3. **Most recent chat** - Fallback to last modified chat

This ensures you always see the most important chat first.

### When Does the Status Bar Change?

- **On file change**: VS Code FileSystemWatcher detects session file modifications
- **On growth**: When a chat's size increases, it becomes the displayed chat
- **On threshold crossing**: Color indicator updates immediately

---

## Quick Pick Menu

Click the status bar to open the Quick Pick menu showing your **top 5 recent chats**.

### Menu Layout

```
┌─────────────────────────────────────────────────────────┐
│ Copilot Chat Size Monitor - Top 5 Recent Chats          │
├─────────────────────────────────────────────────────────┤
│                                          Recent Chats   │
│ ✅ 📝 VS Code Extension for Copilot...  107 MB • 5ae2...│
│    ← Recently active (growing)                          │
│                                                         │
│ ⚠️ Exploring webapp directory structure   405 MB • 5ae2..│
│    2h ago                                               │
│                                                         │
│ ❌ Reviewing project context and docum... 453 MB • 5ae2..│
│    3h ago                                               │
├─────────────────────────────────────────────────────────┤
│                                               Actions   │
│ ├→ Export Chat...     Open VS Code export dialog        │
│ ↻  Refresh            Re-check session sizes            │
│ ⚙  Settings           Configure thresholds              │
└─────────────────────────────────────────────────────────┘
```

---

## Labels & Icons Reference

### Status Labels (Detail Line)

| Label | Meaning |
|-------|---------|
| `← Recently active` | Most recently modified chat in your workspace |
| `← Recently active (growing)` | Most recent chat AND size increased in last 15 seconds |
| `← Growing` | Not the most recent, but size increased in last 15 seconds |
| `2h ago`, `3h ago`, etc. | Time since last modification |

### Icons

| Icon | Location | Meaning |
|------|----------|---------|
| 📝 | Status bar & menu label | Chat file size increased in last 15 seconds |
| 💬 | Status bar | Chat is idle (no recent size changes) |
| ✅ | Menu label | Safe: Size < 300 MB |
| ⚠️ | Menu label | Caution: Size 300-450 MB |
| ❌ | Menu label | Danger: Size > 450 MB |

### Growth Detection Logic

A chat is marked as "growing" when:

1. Its file size increased compared to the previous scan
2. The increase happened within the last **15 seconds**

The 15-second window ensures the indicator remains visible when you open the Quick Pick menu, even if the chat stopped growing momentarily.

---

## Threshold System

### Visual Thresholds

| Indicator | Size Range | Meaning | Action |
|-----------|------------|---------|--------|
| ✅ Green | < 300 MB | Safe | Continue chatting |
| ⚠️ Yellow | 300-450 MB | Caution | Plan to export soon |
| ❌ Red | > 450 MB | Danger | Export immediately! |

### Popup Notifications

Automatic popup alerts when crossing thresholds:

| Threshold | Message | Trigger |
|-----------|---------|---------|
| **Caution (300 MB)** | "Copilot Chat is X MB - Consider exporting soon." | First time crossing 300 MB |
| **Danger (450 MB)** | "⚠️ Copilot Chat is X MB - Export now to avoid data loss!" | First time crossing 450 MB |

**Note:** Notifications only trigger once per threshold crossing to avoid spam. They reset when the chat drops below caution level.

---

## Title Extraction

The extension extracts chat titles to display in the status bar and Quick Pick menu.

### Title Priority

1. **`customTitle`** (Primary) - Current session title, found at END of session file
2. **`generatedTitle`** (Fallback) - Initial title from first exchange, found at START of file
3. **First message text** (Last resort) - First 40 characters of first user message
4. **"Untitled Chat"** (Default) - If no title can be extracted

### Why Two Title Fields?

VS Code stores two different title fields in session JSON files:

| Field | Location in File | Description |
|-------|------------------|-------------|
| `generatedTitle` | First 5KB | Initial title generated after first exchange |
| `customTitle` | Last 5KB | Updated title reflecting the full conversation |

The VS Code Sessions panel displays `customTitle` if present, otherwise `generatedTitle`. Our extension mirrors this behavior exactly.

**Note:** `customTitle` appears to be updated automatically by VS Code as the conversation evolves - it's not limited to user-renamed sessions.

### Performance Optimization

To avoid reading entire 400+ MB files just to get titles:

- Read **last 5KB** first to find `customTitle`
- Read **first 5KB** as fallback for `generatedTitle`
- Cache titles permanently (they don't change after creation)

---

## Workspace Filtering

The extension only shows chats from your **current workspace**.

### How It Works

1. Get current workspace URI from VS Code API (`vscode.workspace.workspaceFile` or `workspaceFolders`)
2. Scan all `workspaceStorage/*/workspace.json` files
3. Match stored URI against current workspace URI
4. Only display sessions from the matched storage folder

### Workspace Types Supported

| Type | workspace.json Field | Example |
|------|---------------------|---------|
| Multi-root workspace | `"workspace": "file:///path/to/project.code-workspace"` | `.code-workspace` files |
| Single folder | `"folder": "file:///path/to/folder"` | Regular folder opened in VS Code |

---

## Empty Session Filtering

The extension hides empty/abandoned sessions that VS Code's Sessions panel also hides.

### Detection Method

Sessions with `"requests": []` (empty array) in the first 2KB are filtered out. This catches:

- Sessions opened but never used
- Draft sessions that were abandoned
- Orphaned sessions from previous VS Code versions

---

## Installation

### From VSIX (Recommended)

```bash
code --install-extension copilot-chat-monitor-0.1.0.vsix
```

### Build from Source

```bash
git clone https://github.com/OutdoGod/vscode-copilot-chat-size-monitor.git
cd vscode-copilot-chat-size-monitor
npm install
npm run compile
npx vsce package --no-dependencies
code --install-extension copilot-chat-monitor-0.1.0.vsix
```

### Development Mode

1. Open the extension folder in VS Code
2. Press **F5** to launch Extension Development Host
3. Make changes to source files
4. Reload the Extension Development Host window to test

**Important:** "Developer: Reload Window" only reloads the *installed* extension, not your development source code. Always use F5 for development testing.

---

## Configuration

Access via: **Settings > Extensions > Copilot Chat Monitor**

| Setting | Default | Description |
|---------|---------|-------------|
| `copilotChatMonitor.cautionThresholdMB` | 300 | Size in MB to show caution indicator |
| `copilotChatMonitor.dangerThresholdMB` | 450 | Size in MB to show danger indicator |

---

## Commands

Access via Command Palette (**Cmd+Shift+P** / **Ctrl+Shift+P**):

| Command | Description |
|---------|-------------|
| `Copilot Chat Monitor: Refresh Size` | Manually refresh all session sizes |
| `Copilot Chat Monitor: Show Options` | Open the Quick Pick menu |

---

## Technical Details

### Session Storage Locations

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/*.json` |
| Windows | `%APPDATA%/Code/User/workspaceStorage/*/chatSessions/*.json` |
| Linux | `~/.config/Code/User/workspaceStorage/*/chatSessions/*.json` |

### Workspace Hash

Each workspace is stored in a folder with a hash identifier (e.g., `5ae28d505d86bfd5cb40720ff699868b`). The hash is derived from the workspace URI by VS Code internally. We match workspaces by reading `workspace.json` files directly rather than computing the hash.

### Performance Optimizations

| Aspect | Optimization |
|--------|-------------|
| **Memory** | Titles cached permanently (~1KB per chat) |
| **Disk I/O** | Only reads first/last 5KB of files for titles |
| **CPU** | Event-driven - only processes on file changes |
| **Startup** | Workspace hash cached after first lookup |
| **Empty check** | Only reads first 2KB to detect empty sessions |

---

## Threshold Recommendations

Based on empirical testing with 27+ exported chat sessions:

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

---

## Troubleshooting

### Extension not showing in status bar

1. Check if extension is installed: Extensions panel > Search "Copilot Chat Monitor"
2. Try reloading: `Cmd+Shift+P` > "Developer: Reload Window"
3. Check for chat sessions in your workspace storage folder

### Wrong chat showing as active

The extension identifies active chats by size growth and modification time, not VS Code panel focus. Click the status bar to see all recent chats.

### Status bar shows old/wrong size

Click **Refresh** in the Quick Pick menu, or run command "Copilot Chat Monitor: Refresh Size"

### Changes not taking effect during development

If you're developing the extension:
1. Run `npm run compile`
2. Package with `npx vsce package --no-dependencies`
3. Reinstall with `code --install-extension copilot-chat-monitor-0.1.0.vsix`
4. Run "Developer: Reload Window"

**Important:** "Developer: Reload Window" reloads the *installed* extension from `~/.vscode/extensions/`, not your local development code.

---

## Contributing

Contributions welcome! See `IDEA_BACKLOG.md` for planned features.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with F5 Extension Development Host
5. Submit a pull request

---

## License

MIT License - see LICENSE for details.

---

## See Also

- [LESSONS_LEARNED.md](LESSONS_LEARNED.md) - Technical deep-dive into VS Code Copilot Chat internals
- [IDEA_BACKLOG.md](IDEA_BACKLOG.md) - Planned features and improvements

---

## Acknowledgments

- Built to solve a real problem experienced during extended Copilot Chat sessions
- Inspired by the lack of any built-in size monitoring in VS Code
- Threshold values derived from empirical testing, not documentation (because there is none)

---

**Made with ❤️ to prevent chat data loss**

*If this extension saved your conversation, consider starring the repo!*
