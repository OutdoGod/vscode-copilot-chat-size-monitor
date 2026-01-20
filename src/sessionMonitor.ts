import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SessionInfo {
  path: string;
  sizeBytes: number;
  lastModified: Date;
  workspaceHash: string;
}

export class SessionMonitor {
  private watcher: vscode.FileSystemWatcher | undefined;
  private allSessions: SessionInfo[] = [];
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
   * Find ALL chat sessions, sorted by most recently modified
   */
  public async findAllSessions(): Promise<SessionInfo[]> {
    const storagePath = this.getStoragePath();
    
    if (!fs.existsSync(storagePath)) {
      return [];
    }

    const sessions: SessionInfo[] = [];

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
          sessions.push({
            path: filePath,
            sizeBytes: stats.size,
            lastModified: stats.mtime,
            workspaceHash: workspace.substring(0, 8)
          });
        } catch {
          // Skip inaccessible files
        }
      }
    }

    // Sort by most recently modified first
    sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    this.allSessions = sessions;
    return sessions;
  }

  /**
   * Get top N most recent sessions
   */
  public getTopSessions(n: number = 5): SessionInfo[] {
    return this.allSessions.slice(0, n);
  }

  /**
   * Get the most recent session
   */
  public getMostRecent(): SessionInfo | undefined {
    return this.allSessions[0];
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
      await this.findAllSessions();
      const mostRecent = this.getMostRecent();
      this.onSizeChangeEmitter.fire(mostRecent?.sizeBytes ?? -1);
    };

    this.watcher.onDidChange(updateSize);
    this.watcher.onDidCreate(updateSize);
    this.watcher.onDidDelete(updateSize);
  }

  /**
   * Get current session size
   */
  public getCurrentSize(): number {
    return this.getMostRecent()?.sizeBytes ?? -1;
  }

  /**
   * Get current session path (for debugging)
   */
  public getCurrentPath(): string | undefined {
    return this.getMostRecent()?.path;
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.watcher?.dispose();
    this.onSizeChangeEmitter.dispose();
  }
}
