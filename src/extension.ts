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
  const session = await sessionMonitor.findCurrentSession();
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
  const currentSize = sessionMonitor.getCurrentSize();
  const currentPath = sessionMonitor.getCurrentPath();
  
  const options = [
    { label: '$(export) Export Chat...', description: 'Open VS Code export dialog', command: 'workbench.action.chat.export' },
    { label: '$(refresh) Refresh Size', description: 'Re-check session size', command: 'copilot-chat-monitor.refresh' },
    { label: '$(gear) Open Settings', description: 'Configure thresholds', command: 'workbench.action.openSettings', args: 'copilotChatMonitor' }
  ];

  // Add info about current session
  const infoLabel = currentPath 
    ? `Current: ${formatSizeMB(currentSize)} MB`
    : 'No session found';

  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: `Copilot Chat Monitor - ${infoLabel}`
  });

  if (selected) {
    if (selected.args) {
      vscode.commands.executeCommand(selected.command, selected.args);
    } else {
      vscode.commands.executeCommand(selected.command);
    }
  }
}

export function deactivate() {
  sessionMonitor?.dispose();
}
