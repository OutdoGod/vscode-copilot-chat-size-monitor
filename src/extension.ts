import * as vscode from 'vscode';
import { SessionMonitor } from './sessionMonitor';
import { getIndicator, formatSizeMB, getTooltip, THRESHOLDS } from './thresholds';

let statusBarItem: vscode.StatusBarItem;
let sessionMonitor: SessionMonitor;
let lastNotifiedThreshold: number = 0;

export async function activate(context: vscode.ExtensionContext) {
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'copilot-chat-monitor.showOptions';
  context.subscriptions.push(statusBarItem);

  // Create session monitor
  sessionMonitor = new SessionMonitor();
  context.subscriptions.push({ dispose: () => sessionMonitor.dispose() });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-chat-monitor.refresh', updateStatusBar),
    vscode.commands.registerCommand('copilot-chat-monitor.showOptions', showOptions)
  );

  // Subscribe to size changes
  sessionMonitor.onSizeChange((size) => {
    updateStatusBarWithSize(size);
    checkThresholdNotification(size);
  });

  // Initial update
  await updateStatusBar();

  // Start watching
  sessionMonitor.startWatching();

  console.log('Copilot Chat Monitor activated');
}

async function updateStatusBar() {
  await sessionMonitor.findAllSessions();
  const session = sessionMonitor.getMostRecent();
  updateStatusBarWithSize(session?.sizeBytes ?? -1);
}

function updateStatusBarWithSize(sizeBytes: number) {
  const indicator = getIndicator(sizeBytes);
  const sizeMB = formatSizeMB(sizeBytes);
  
  statusBarItem.text = `💬 ${sizeMB} MB ${indicator}`;
  statusBarItem.tooltip = getTooltip(sizeBytes);
  statusBarItem.show();
}

function checkThresholdNotification(sizeBytes: number) {
  // Only notify once per threshold crossing
  if (sizeBytes >= THRESHOLDS.DANGER && lastNotifiedThreshold < THRESHOLDS.DANGER) {
    vscode.window.showWarningMessage(
      `⚠️ Copilot Chat is ${formatSizeMB(sizeBytes)} MB - Export now to avoid data loss!`,
      'Export Chat'
    ).then(selection => {
      if (selection === 'Export Chat') {
        vscode.commands.executeCommand('workbench.action.chat.export');
      }
    });
    lastNotifiedThreshold = THRESHOLDS.DANGER;
  } else if (sizeBytes >= THRESHOLDS.CAUTION && lastNotifiedThreshold < THRESHOLDS.CAUTION) {
    vscode.window.showInformationMessage(
      `Copilot Chat is ${formatSizeMB(sizeBytes)} MB - Consider exporting soon.`
    );
    lastNotifiedThreshold = THRESHOLDS.CAUTION;
  } else if (sizeBytes < THRESHOLDS.CAUTION) {
    lastNotifiedThreshold = 0; // Reset when back in safe zone
  }
}

async function showOptions() {
  const topSessions = sessionMonitor.getTopSessions(5);
  
  // Build options: top 5 chats + actions
  const chatItems = topSessions.map((session, index) => {
    const sizeMB = formatSizeMB(session.sizeBytes);
    const indicator = getIndicator(session.sizeBytes);
    const timeAgo = getTimeAgo(session.lastModified);
    return {
      label: `${indicator} ${sizeMB} MB`,
      description: `${session.workspaceHash}... • ${timeAgo}`,
      detail: index === 0 ? '← Most recent (active)' : undefined,
      isChat: true,
      session
    };
  });

  const actionItems = [
    { label: '$(export) Export Chat...', description: 'Open VS Code export dialog', command: 'workbench.action.chat.export', isChat: false },
    { label: '$(refresh) Refresh', description: 'Re-check session sizes', command: 'copilot-chat-monitor.refresh', isChat: false },
    { label: '$(gear) Settings', description: 'Configure thresholds', command: 'workbench.action.openSettings', args: 'copilotChatMonitor', isChat: false }
  ];

  const allItems = [
    { label: 'Recent Chats', kind: vscode.QuickPickItemKind.Separator },
    ...chatItems,
    { label: 'Actions', kind: vscode.QuickPickItemKind.Separator },
    ...actionItems
  ];

  const selected = await vscode.window.showQuickPick(allItems as any[], {
    placeHolder: 'Copilot Chat Size Monitor - Top 5 Recent Chats'
  });

  if (selected && 'command' in selected) {
    if (selected.args) {
      vscode.commands.executeCommand(selected.command, selected.args);
    } else {
      vscode.commands.executeCommand(selected.command);
    }
  }
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function deactivate() {
  sessionMonitor?.dispose();
}
