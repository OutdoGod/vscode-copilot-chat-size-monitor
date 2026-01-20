import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SessionInfo {
  path: string;
  sizeBytes: number;
  lastModified: Date;
}

export class SessionMonitor {
  private watcher: vscode.FileSystemWatcher | undefined;
  private currentSession: SessionInfo | undefined;
  private onSizeChangeEmitter = new vscode.EventEmitter<number>();
  
  public readonly onSizeChange = this.onSizeChangeEmitter.event;

  /**
   * Get the VS Code storage path for current platform
   */
  private getStoragePath(): string {
    const home = os.homedir();
    switch (process.platform) {
      case 'darwin':
        return path.join(home, 'Library/Application Support/Code/User/workspaceStorage');
      case 'win32':
        return path.join(process.env.APPDATA || home, 'Code/User/workspaceStorage');
      default: // linux
        return path.join(home, '.config/Code/User/workspaceStorage');
    }
  }

  /**
   * Find all chat session files and return the largest (likely current)
   * Monitors ALL workspaces in codegym, not just the current one
   */
  public async findCurrentSession(): Promise<SessionInfo | undefined> {
    const storagePath = this.getStoragePath();
    
    if (!fs.existsSync(storagePath)) {
      return undefined;
    }

    let mostRecent: SessionInfo | undefined;

    // Search all workspace folders for chatSessions
    const workspaces = fs.readdirSync(storagePath);
    for (const workspace of workspaces) {
      const chatDir = path.join(storagePath, workspace, 'chatSessions');
      if (!fs.existsSync(chatDir)) continue;

      const files = fs.readdirSync(chatDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const filePath = path.join(chatDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (!mostRecent || stats.mtime > mostRecent.lastModified) {
            mostRecent = {
              path: filePath,
              sizeBytes: stats.size,
              lastModified: stats.mtime
            };
          }
        } catch {
          // Skip inaccessible files
        }
      }
    }

    this.currentSession = mostRecent;
    return mostRecent;
  }

  /**
   * Start watching for file changes across ALL workspaces
   */
  public startWatching(): void {
    const storagePath = this.getStoragePath();
    const pattern = new vscode.RelativePattern(
      storagePath,
      '**/chatSessions/*.json'
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const updateSize = async () => {
      const session = await this.findCurrentSession();
      this.onSizeChangeEmitter.fire(session?.sizeBytes ?? -1);
    };

    this.watcher.onDidChange(updateSize);
    this.watcher.onDidCreate(updateSize);
    this.watcher.onDidDelete(updateSize);
  }

  /**
   * Get current session size
   */
  public getCurrentSize(): number {
    return this.currentSession?.sizeBytes ?? -1;
  }

  /**
   * Get current session path (for debugging)
   */
  public getCurrentPath(): string | undefined {
    return this.currentSession?.path;
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.watcher?.dispose();
    this.onSizeChangeEmitter.dispose();
  }
}
