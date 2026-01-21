# Lessons Learned

Technical deep-dive into VS Code Copilot Chat internals discovered while building this extension.

---

## VS Code Copilot Chat Session Structure

### Session File Format

Each chat session is stored as a JSON file in the workspace storage:

```
~/Library/Application Support/Code/User/workspaceStorage/<hash>/chatSessions/<uuid>.json
```

### Key JSON Fields

| Field | Location | Description |
|-------|----------|-------------|
| `version` | Start | Session format version (currently 3) |
| `sessionId` | Start | UUID matching the filename |
| `creationDate` | Start | Unix timestamp (milliseconds) |
| `lastMessageDate` | Start | Unix timestamp of last activity |
| `requests` | Start | Array of user/assistant exchanges |
| `generatedTitle` | Start (~first 2KB) | LLM-generated title after first exchange |
| `customTitle` | End (~last 2KB) | User-defined title (if renamed) |

### Title Field Discovery

**Key insight:** The VS Code Sessions panel displays `customTitle` if present, otherwise `generatedTitle`.

Initially, we only read `generatedTitle` from the start of the file. Titles didn't match the Sessions panel. After investigation:

- `generatedTitle` is written early in the file after the first exchange (e.g., "Read documentation files")
- `customTitle` is written at the END of the file and reflects the evolved conversation (e.g., "VS Code Extension for Copilot Chat Monitoring")
- Large files (400+ MB) require reading the END to get the correct title

**Discovery:** `customTitle` appears to be updated automatically by VS Code as conversations evolve - it's not limited to user-renamed sessions. This explains why it's at the end of the file (appended/updated as the chat grows).

**Solution:** Read last 5KB first for `customTitle`, fallback to first 5KB for `generatedTitle`.

### Empty Session Detection

Empty sessions have `"requests": []` in the first 2KB. These are:
- Sessions created but never used
- Draft sessions from previous VS Code versions
- Orphaned by crashes or restarts

VS Code's Sessions panel hides these. Our extension mirrors this behavior.

---

## Workspace Storage Architecture

### Hash Computation

Each workspace has a storage folder named with a hash:

```
5ae28d505d86bfd5cb40720ff699868b
```

**Key insight:** The hash is derived from the workspace URI, but the algorithm is internal to VS Code and not easily reproducible.

**Solution:** Instead of computing the hash, read `workspace.json` in each folder:

```json
// Multi-root workspace
{ "workspace": "file:///path/to/project.code-workspace" }

// Single folder
{ "folder": "file:///path/to/folder" }
```

Match the URI against `vscode.workspace.workspaceFile` or `vscode.workspace.workspaceFolders[0].uri`.

### Workspace Types

| Type | API | workspace.json Key |
|------|-----|-------------------|
| Multi-root | `vscode.workspace.workspaceFile` | `"workspace"` |
| Single folder | `vscode.workspace.workspaceFolders[0].uri` | `"folder"` |
| Untitled | `undefined` | N/A |

---

## File System Watching

### FileSystemWatcher Behavior

VS Code's `FileSystemWatcher` works across the entire filesystem, not just the workspace:

```typescript
const pattern = new vscode.RelativePattern(
  storagePath,
  '**/chatSessions/*.json'
);
```

### mtime Unreliability

**Key insight:** File modification time (`mtime`) is NOT a reliable indicator of "active chat".

VS Code touches session files for:
- Sync operations
- Metadata updates
- State persistence

**Solution:** Track actual file SIZE changes, not just mtime. A size increase means real content was added.

### Growth Detection Window

Problem: Size increase is detected on one scan, but by the next scan, the sizes match again.

**Solution:** Implement a time window (15 seconds) where a file is considered "growing" after its last size increase. This ensures the indicator persists long enough to be visible in the UI.

```typescript
private lastGrowthTime: Map<string, number> = new Map();
private static readonly GROWTH_WINDOW_MS = 15000;

// In scan:
if (grewThisScan) {
  this.lastGrowthTime.set(filePath, Date.now());
}
const isGrowing = (Date.now() - lastGrowthTime) < GROWTH_WINDOW_MS;
```

---

## Extension Development Lessons

### Installed vs Development Code

**Critical lesson:** "Developer: Reload Window" reloads the INSTALLED extension, not development source.

Extensions are installed to:
```
~/.vscode/extensions/<publisher>.<name>-<version>/
```

When you run "Developer: Reload Window", VS Code loads from this directory, NOT from your development folder.

**Workflow for testing changes:**
1. `npm run compile` - Compile TypeScript
2. `npx vsce package --no-dependencies` - Create .vsix
3. `code --uninstall-extension <id>` - Remove old version
4. `code --install-extension <file>.vsix` - Install new version
5. "Developer: Reload Window" - Now loads updated code

**For rapid iteration:** Use F5 to launch Extension Development Host instead.

### Large File Reading

**Problem:** Reading 400+ MB files to extract a 50-character title causes crashes.

**Solution:** Use low-level file operations to read specific byte ranges:

```typescript
const fd = fs.openSync(filePath, 'r');
const buffer = Buffer.alloc(5000);

// Read from start
fs.readSync(fd, buffer, 0, 5000, 0);

// Read from end
fs.readSync(fd, buffer, 0, 5000, fileSize - 5000);

fs.closeSync(fd);
```

### Title Caching

**Insight:** Titles never change after creation (except customTitle which is user-set).

**Optimization:** Cache titles permanently in memory. Never re-read a file for its title.

```typescript
private titleCache: Map<string, string> = new Map();

// Only extract once
if (!this.titleCache.has(filePath)) {
  this.titleCache.set(filePath, this.extractTitle(filePath));
}
```

---

## Export Size Limits

### Empirical Testing Results

| Size | Export Result |
|------|---------------|
| 452 MB | ✅ Success |
| 489 MB | ✅ Success |
| 496 MB | ✅ Success |
| 512 MB | ❌ Data loss - truncated |

### Error Types

| Error | Cause | Size Threshold |
|-------|-------|----------------|
| Silent truncation | Buffer limits | ~500+ MB |
| "Invalid string length" | V8 string limit | ~512+ MB |
| Export hangs | Memory exhaustion | 600+ MB |

### Recommendations

- **Safe zone:** < 300 MB
- **Caution zone:** 300-450 MB
- **Danger zone:** > 450 MB
- **Critical:** > 480 MB

---

## Performance Considerations

### Memory Usage

| Component | Approximate Size |
|-----------|-----------------|
| Title cache | ~100 bytes per chat |
| Previous sizes map | ~50 bytes per chat |
| Growth times map | ~50 bytes per chat |
| Session info array | ~200 bytes per chat |

Total: ~400 bytes per chat session. With 100 sessions: ~40KB.

### Disk I/O

| Operation | Bytes Read | When |
|-----------|------------|------|
| Title extraction | 5-10KB | Once per session (cached) |
| Empty check | 2KB | Every scan |
| Size check | 0 (stat only) | Every scan |

### CPU

- Event-driven: Only processes when file changes detected
- No polling: Zero CPU usage when idle
- Minimal parsing: Regex on small buffers, no full JSON parse

---

## Common Pitfalls

### 1. Assuming mtime = active chat

**Wrong:** Most recently modified file is the active chat.  
**Right:** Most recently GROWN file is the active chat.

### 2. Reading entire large files

**Wrong:** `fs.readFileSync(filePath, 'utf8')`  
**Right:** Read specific byte ranges with `fs.openSync` + `fs.readSync`

### 3. Trusting generatedTitle alone

**Wrong:** Title is always at the start of the file.  
**Right:** customTitle (user-defined) is at the END of the file.

### 4. Cross-workspace monitoring

**Wrong:** Monitor all workspaces to catch all chats.  
**Right:** Only monitor current workspace to avoid confusion.

### 5. Reload Window for development

**Wrong:** "Developer: Reload Window" picks up source changes.  
**Right:** Must repackage and reinstall .vsix, or use F5.

---

## Future Improvements

See [IDEA_BACKLOG.md](IDEA_BACKLOG.md) for planned features based on these lessons.

---

*Last updated: January 2026*
