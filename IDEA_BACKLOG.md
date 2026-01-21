# Idea Backlog - Copilot Chat Size Monitor

## Status Legend
- 🔴 Blocked / Needs Research
- 🟡 Ready to Build
- 🟢 In Progress
- ✅ Done
- ❌ Rejected

---

## 🟡 A. Two-Indicator Status Bar

### Concept
Show two separate indicators in the status bar:
```
💬 MyChat 6MB ✅ | ⚠️ OtherChat 405MB
   ↑ growing       ↑ at risk (if different)
```

### Value Proposition
- Developer sees BOTH their active chat AND any dangerous chat
- Immediate awareness when Copilot modifies a background chat
- No need to click to see if something is at risk

### Implementation Details
1. Track `previousSizes: Map<path, number>` to detect growth
2. Growing = `currentSize > previousSize` (with debounce)
3. Show growing chat on left, largest at-risk on right
4. If same chat → show single indicator

### Risks & Concerns
| Risk | Severity | Mitigation |
|------|----------|------------|
| UX confusion with two indicators | Medium | Test with users first |
| Status bar too wide | Low | Truncate titles |
| Performance (tracking all sizes) | Low | Only track top 10 by size |
| Edge case: 2 chats growing simultaneously | Low | Show larger one |

### Estimate
~1 hour implementation

### Decision
Deferred to post-MVP. Implementing simpler option B first.

---

## ✅ B. Growth Detection + Titles (MVP Enhancement)

### Concept
- Status bar shows the GROWING chat (your active one)
- QuickPick shows titles + growth status
- Notification if ANY chat crosses danger threshold

### Implementation
- Parse title from session JSON (first user message or summary)
- Detect growth via size delta between checks
- Cache titles (only re-read when size changes)

### Status
🟢 In Progress

---

## 🔴 C. Workspace-Scoped Monitoring

### Concept
Only monitor chats from the CURRENT workspace, not all workspaces.

### Challenge
- Need to map workspace hash to actual workspace path
- `workspaceStorage/{hash}/workspace.json` contains the mapping
- Would require reading this file for each workspace

### Value
- Less noise from other projects
- More focused monitoring

### Risks
- User might have dangerous chat in another workspace and not know
- Implementation complexity

### Decision
Not pursuing for MVP. Current "show all" approach is safer.

---

## 🟡 D. Export Specific Chat

### Concept
When clicking a chat in QuickPick, offer to export THAT specific chat.

### Challenge
- VS Code's `workbench.action.chat.export` exports the active chat
- No API to export a specific session by path
- Would need to manually copy the JSON file

### Workaround
Could offer "Open in Finder" or "Copy path" for manual export.

---

## 🔴 E. "Completed" Status Detection

### Concept
Show if a chat is "Completed" (Copilot finished responding) vs "In Progress"

### Challenge
- "Completed" status is likely UI state, not in session JSON
- May require reverse-engineering VS Code's Copilot storage

### Research Needed
- Inspect session JSON structure
- Check if there's a status field

---

## 🟡 F. Session Age Warnings

### Concept
Warn if a session is very old (>7 days) as it may have stale context.

### Value
- Encourage starting fresh chats
- Reduce accumulated cruft

### Implementation
Simple: check `createdAt` or first message timestamp.

---

## 🟡 G. Size Growth Rate

### Concept
Show how fast a chat is growing (MB/hour or MB/message).

### Value
- Predict when chat will hit danger zone
- "At current rate, this chat will hit 450MB in ~2 hours"

### Implementation
- Track size history over time
- Simple linear extrapolation

---

## 🔴 H. Auto-Export Before Danger

### Concept
Automatically export chat when approaching danger threshold.

### Challenge
- Need to determine export location
- User confirmation?
- Could be annoying if triggered too often

### Risk
- Silent exports could confuse users
- Disk space concerns

---

## Notes from Analysis Session (Jan 20, 2026)

### Key Insights
1. `mtime` is unreliable - VS Code touches files for sync/metadata, not just user messages
2. Only reliable signal of user activity is **file size increasing**
3. Title is auto-generated and stable (doesn't change)
4. "Completed" status is UI-only, not in JSON

### User Requirements
- Know current chat's size (the one I'm typing in)
- Alert if ANY chat crosses danger threshold
- See all recent chats with sizes in QuickPick
- Distinguish between "I'm chatting here" vs "something touched this"

### Performance Considerations
- Reading JSON for titles adds overhead
- Solution: cache titles, only re-read when size changes
- Debounce file watcher events (ignore < 2 sec apart)

---

*Last Updated: January 20, 2026*
