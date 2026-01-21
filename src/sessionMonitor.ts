import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SessionInfo {
  path: string;
  sizeBytes: number;
  lastModified: Date;
  workspaceHash: string;
  title: string;
  isGrowing: boolean;
}

export class SessionMonitor {
  private watcher: vscode.FileSystemWatcher | undefined;
  private allSessions: SessionInfo[] = [];
  private previousSizes: Map<string, number> = new Map();
  private lastGrowthTime: Map<string, number> = new Map(); // Track when file last grew
  private titleCache: Map<string, string> = new Map();
  private onSizeChangeEmitter = new vscode.EventEmitter<number>();
  private currentWorkspaceHash: string | undefined;
  
  // Consider a file "growing" if it grew within this time window (ms)
  private static readonly GROWTH_WINDOW_MS = 10000; // 10 seconds
  
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
   * Get the current VS Code workspace URI
   * Returns the workspace file URI for multi-root, or folder URI for single folder
   */
  private getCurrentWorkspaceUri(): string | undefined {
    // Check for multi-root workspace file first
    const workspaceFile = vscode.workspace.workspaceFile;
    if (workspaceFile) {
      return workspaceFile.toString();
    }

    // Single folder workspace
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return folders[0].uri.toString();
    }

    return undefined;
  }

  /**
   * Find the workspace storage hash for the current workspace
   * by reading workspace.json files in each storage folder
   */
  private findCurrentWorkspaceHash(): string | undefined {
    const storagePath = this.getStoragePath();
    const currentUri = this.getCurrentWorkspaceUri();

    if (!currentUri || !fs.existsSync(storagePath)) {
      return undefined;
    }

    const workspaces = fs.readdirSync(storagePath);
    for (const workspace of workspaces) {
      const workspaceJsonPath = path.join(storagePath, workspace, 'workspace.json');
      if (!fs.existsSync(workspaceJsonPath)) continue;

      try {
        const content = fs.readFileSync(workspaceJsonPath, 'utf8');
        const data = JSON.parse(content);
        
        // Multi-root workspace uses "workspace", single folder uses "folder"
        const storedUri = data.workspace || data.folder;
        
        if (storedUri === currentUri) {
          return workspace;
        }
      } catch {
        // Skip unreadable workspace.json files
      }
    }

    return undefined;
  }

  /**
   * Find ALL chat sessions, sorted by most recently modified
   * Filters to current workspace only
   */
  public async findAllSessions(): Promise<SessionInfo[]> {
    const storagePath = this.getStoragePath();
    
    if (!fs.existsSync(storagePath)) {
      return [];
    }

    // Find the current workspace hash (cache it for performance)
    if (!this.currentWorkspaceHash) {
      this.currentWorkspaceHash = this.findCurrentWorkspaceHash();
    }

    const sessions: SessionInfo[] = [];

    // Only search the current workspace's chatSessions folder
    if (this.currentWorkspaceHash) {
      const chatDir = path.join(storagePath, this.currentWorkspaceHash, 'chatSessions');
      if (fs.existsSync(chatDir)) {
        const files = fs.readdirSync(chatDir).filter(f => f.endsWith('.json'));
        const now = Date.now();
        
        for (const file of files) {
          const filePath = path.join(chatDir, file);
          try {
            const stats = fs.statSync(filePath);
            const previousSize = this.previousSizes.get(filePath) ?? 0;
            const grewThisScan = stats.size > previousSize && previousSize > 0;
            
            // Track when file last grew
            if (grewThisScan) {
              this.lastGrowthTime.set(filePath, now);
            }
            
            // Consider "growing" if it grew within the time window
            const lastGrowth = this.lastGrowthTime.get(filePath) ?? 0;
            const isGrowing = (now - lastGrowth) < SessionMonitor.GROWTH_WINDOW_MS;
            
            // Get title from cache - only extract once (title never changes)
            let title = this.titleCache.get(filePath);
            if (!title) {
              title = this.extractTitle(filePath);
              this.titleCache.set(filePath, title);
            }
            
            // Update previous size
            this.previousSizes.set(filePath, stats.size);
            
            sessions.push({
              path: filePath,
              sizeBytes: stats.size,
              lastModified: stats.mtime,
              workspaceHash: this.currentWorkspaceHash.substring(0, 8),
              title,
              isGrowing
            });
          } catch {
            // Skip inaccessible files
          }
        }
      }
    }

    // Sort by most recently modified first
    sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    this.allSessions = sessions;
    return sessions;
  }

  /**
   * Extract title from session JSON file
   * Only reads first 5KB - title is near the start
   */
  private extractTitle(filePath: string): string {
    try {
      const stats = fs.statSync(filePath);
      const fd = fs.openSync(filePath, 'r');
      
      // Try to get customTitle from end of file (last 5KB)
      // customTitle is the official VS Code session title
      const endSize = Math.min(5000, stats.size);
      const endBuffer = Buffer.alloc(endSize);
      fs.readSync(fd, endBuffer, 0, endSize, Math.max(0, stats.size - endSize));
      const endContent = endBuffer.toString('utf8');
      const customMatch = endContent.match(/"customTitle"\s*:\s*"([^"]+)"/);
      if (customMatch && customMatch[1]) {
        fs.closeSync(fd);
        return customMatch[1].substring(0, 40);
      }
      
      // Fallback: get generatedTitle from start of file (first 5KB)
      const startBuffer = Buffer.alloc(5000);
      fs.readSync(fd, startBuffer, 0, 5000, 0);
      fs.closeSync(fd);
      const startContent = startBuffer.toString('utf8');
      const genMatch = startContent.match(/"generatedTitle"\s*:\s*"([^"]+)"/);
      if (genMatch && genMatch[1]) {
        return genMatch[1].substring(0, 40);
      }
      
      // Last fallback: first user message
      const textMatch = startContent.match(/"text"\s*:\s*"([^"]{1,40})/);
      if (textMatch && textMatch[1]) {
        return textMatch[1] + '...';
      }
    } catch {
      // Ignore read errors
    }
    return 'Untitled Chat';
  }

  /**
   * Get the growing session (if any) - this is likely the user's active chat
   */
  public getGrowingSession(): SessionInfo | undefined {
    return this.allSessions.find(s => s.isGrowing);
  }

  /**
   * Get the largest session at risk (>= caution threshold)
   */
  public getLargestAtRisk(cautionBytes: number, limit: number = 5): SessionInfo | undefined {
    return this.allSessions.slice(0, limit)
      .filter(s => s.sizeBytes >= cautionBytes)
      .sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
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
