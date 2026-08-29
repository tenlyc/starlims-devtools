/**
 * Git Service for STARLIMS DevTools
 * Handles git operations for the local workspace
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  hasChanges: boolean;
  changedFiles: string[];
}

/**
 * Git Service class
 */
export class GitService {
  private workspacePath: string;
  private gitPath = 'git';

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Execute a git command
   */
  private async executeGitCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const gitProcess = spawn(this.gitPath, args, {
        cwd: this.workspacePath,
        shell: true
      });

      let stdout = '';
      let stderr = '';

      gitProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      gitProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      gitProcess.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || stdout));
        }
      });

      gitProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Check if git is available
   */
  public async isGitAvailable(): Promise<boolean> {
    try {
      await this.executeGitCommand(['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the workspace is a git repository
   */
  public async isGitRepository(): Promise<boolean> {
    try {
      await this.executeGitCommand(['rev-parse', '--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize a git repository
   */
  public async initializeRepository(): Promise<boolean> {
    try {
      await this.executeGitCommand(['init']);
      console.log(`Git repository initialized in ${this.workspacePath}`);
      return true;
    } catch (error: any) {
      console.error(`Failed to initialize git repository: ${error.message}`);
      return false;
    }
  }

  /**
   * Get git status
   */
  public async getStatus(): Promise<GitStatus> {
    try {
      const isRepo = await this.isGitRepository();
      if (!isRepo) {
        return { isRepo: false, branch: '', hasChanges: false, changedFiles: [] };
      }

      const branch = await this.getCurrentBranch();
      const changedFiles = await this.getChangedFiles();

      return {
        isRepo: true,
        branch,
        hasChanges: changedFiles.length > 0,
        changedFiles
      };
    } catch {
      return { isRepo: false, branch: '', hasChanges: false, changedFiles: [] };
    }
  }

  /**
   * Get the list of changed files
   */
  public async getChangedFiles(): Promise<string[]> {
    try {
      const status = await this.executeGitCommand(['status', '--porcelain']);
      if (!status.trim()) {
        return [];
      }

      const files = status
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          // Format: "XY filename" where XY are status codes
          return line.substring(3).trim();
        });

      return files;
    } catch {
      return [];
    }
  }

  /**
   * Get git diff
   */
  public async getDiff(): Promise<string> {
    try {
      const diff = await this.executeGitCommand(['diff', 'HEAD']);
      return diff;
    } catch {
      return '';
    }
  }

  /**
   * Get staged diff
   */
  public async getStagedDiff(): Promise<string> {
    try {
      const diff = await this.executeGitCommand(['diff', '--cached']);
      return diff;
    } catch {
      return '';
    }
  }

  /**
   * Stage all changes
   */
  public async stageAll(): Promise<boolean> {
    try {
      await this.executeGitCommand(['add', '.']);
      return true;
    } catch (error: any) {
      console.error(`Failed to stage changes: ${error.message}`);
      return false;
    }
  }

  /**
   * Commit changes
   */
  public async commit(message: string): Promise<boolean> {
    try {
      await this.executeGitCommand(['commit', '-m', message]);
      return true;
    } catch (error: any) {
      console.error(`Failed to commit: ${error.message}`);
      return false;
    }
  }

  /**
   * Push to remote
   */
  public async push(remoteName = 'origin', branchName?: string): Promise<boolean> {
    try {
      const args = ['push', remoteName];
      if (branchName) {
        args.push(branchName);
      }
      await this.executeGitCommand(args);
      return true;
    } catch (error: any) {
      console.error(`Failed to push: ${error.message}`);
      return false;
    }
  }

  /**
   * Pull from remote
   */
  public async pull(remoteName = 'origin', branchName?: string): Promise<boolean> {
    try {
      const args = ['pull', remoteName];
      if (branchName) {
        args.push(branchName);
      }
      await this.executeGitCommand(args);
      return true;
    } catch (error: any) {
      console.error(`Failed to pull: ${error.message}`);
      return false;
    }
  }

  /**
   * Add remote
   */
  public async addRemote(remoteName: string, remoteUrl: string): Promise<boolean> {
    try {
      // Check if remote already exists
      try {
        await this.executeGitCommand(['remote', 'get-url', remoteName]);
        // Remote exists, update URL
        await this.executeGitCommand(['remote', 'set-url', remoteName, remoteUrl]);
      } catch {
        // Remote doesn't exist, add it
        await this.executeGitCommand(['remote', 'add', remoteName, remoteUrl]);
      }
      return true;
    } catch (error: any) {
      console.error(`Failed to add remote: ${error.message}`);
      return false;
    }
  }

  /**
   * Get current branch
   */
  public async getCurrentBranch(): Promise<string> {
    try {
      const branch = await this.executeGitCommand(['branch', '--show-current']);
      return branch.trim();
    } catch {
      return '';
    }
  }

  /**
   * Get remote URL
   */
  public async getRemoteUrl(remoteName = 'origin'): Promise<string | null> {
    try {
      const url = await this.executeGitCommand(['remote', 'get-url', remoteName]);
      return url.trim();
    } catch {
      return null;
    }
  }

  /**
   * Check if there are changes
   */
  public async hasChanges(): Promise<boolean> {
    const files = await this.getChangedFiles();
    return files.length > 0;
  }

  /**
   * Get commit history
   */
  public async getCommitHistory(limit = 20): Promise<GitCommit[]> {
    try {
      const log = await this.executeGitCommand([
        'log',
        `--max-count=${limit}`,
        '--pretty=format:%H|%s|%an|%ai'
      ]);

      if (!log.trim()) {
        return [];
      }

      return log.split('\n').map(line => {
        const [hash, message, author, date] = line.split('|');
        return { hash, message, author, date };
      });
    } catch {
      return [];
    }
  }

  /**
   * Checkout a file
   */
  public async checkoutFile(filePath: string): Promise<boolean> {
    try {
      await this.executeGitCommand(['checkout', '--', filePath]);
      return true;
    } catch (error: any) {
      console.error(`Failed to checkout file: ${error.message}`);
      return false;
    }
  }

  /**
   * Discard changes in a file
   */
  public async discardChanges(filePath: string): Promise<boolean> {
    try {
      await this.executeGitCommand(['checkout', '--', filePath]);
      return true;
    } catch (error: any) {
      console.error(`Failed to discard changes: ${error.message}`);
      return false;
    }
  }

  /**
   * Get file diff
   */
  public async getFileDiff(filePath: string): Promise<string> {
    try {
      const diff = await this.executeGitCommand(['diff', '--', filePath]);
      return diff;
    } catch {
      return '';
    }
  }
}

export default GitService;
