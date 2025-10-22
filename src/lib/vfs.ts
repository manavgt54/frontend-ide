import Dexie, { Table } from 'dexie';

// Database schema
export interface Project {
  id: string;
  name: string;
  createdAt: number;
  lastModified: number;
  status: 'local' | 'syncing' | 'synced' | 'error';
}

export interface FileMeta {
  id: string;
  projectId: string;
  path: string;
  name: string;
  size: number;
  mtime: number;
  hash?: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'committed' | 'error';
  isDirectory: boolean;
  parentPath?: string;
  uploadedAt?: number;
  errorMessage?: string;
}

export interface FileChunk {
  id: string;
  fileId: string;
  chunkIndex: number;
  blob: Blob;
  size: number;
  hash?: string;
  uploaded: boolean;
}

export interface SyncQueue {
  id: string;
  projectId: string;
  itemType: 'meta' | 'content';
  fileId?: string;
  batchId?: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  lastAttempt?: number;
  errorMessage?: string;
  checkpoint?: any;
}

export interface Batch {
  id: string;
  projectId: string;
  batchHash: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  fileCount: number;
  totalSize: number;
  uploadedSize: number;
  createdAt: number;
  completedAt?: number;
  errorMessage?: string;
}

class VFSDatabase extends Dexie {
  projects!: Table<Project>;
  files!: Table<FileMeta>;
  fileChunks!: Table<FileChunk>;
  syncQueue!: Table<SyncQueue>;
  batches!: Table<Batch>;

  constructor() {
    super('VFSDatabase');
    this.version(1).stores({
      projects: 'id, name, createdAt, status',
      files: 'id, projectId, path, name, status, isDirectory, parentPath',
      fileChunks: 'id, fileId, chunkIndex, uploaded',
      syncQueue: 'id, projectId, itemType, status, priority, createdAt',
      batches: 'id, projectId, status, createdAt'
    });
  }
}

export const db = new VFSDatabase();

// File status constants
export const FILE_STATUS = {
  PENDING: 'pending',
  UPLOADING: 'uploading', 
  UPLOADED: 'uploaded',
  COMMITTED: 'committed',
  ERROR: 'error'
} as const;

export const SYNC_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const;

// Default ignore patterns (similar to .gitignore)
export const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/',
  '.git/',
  '.vscode/',
  '.idea/',
  'dist/',
  'build/',
  '.cache/',
  '.next/',
  '.nuxt/',
  'coverage/',
  '.nyc_output/',
  '__pycache__/',
  '.pytest_cache/',
  '.mypy_cache/',
  '*.pyc',
  '*.pyo',
  '*.pyd',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '*.log',
  '*.tmp',
  '*.temp'
];

// Utility functions
export function shouldIgnoreFile(path: string, customIgnorePatterns: string[] = []): boolean {
  const allPatterns = [...DEFAULT_IGNORE_PATTERNS, ...customIgnorePatterns];
  
  return allPatterns.some(pattern => {
    if (pattern.endsWith('/')) {
      // Directory pattern
      return path.includes(pattern) || path.startsWith(pattern.slice(0, -1));
    } else if (pattern.includes('*')) {
      // Wildcard pattern
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(path);
    } else {
      // Exact match
      return path === pattern || path.endsWith('/' + pattern);
    }
  });
}

export function generateFileId(projectId: string, path: string): string {
  return `${projectId}:${path}`;
}

export function generateChunkId(fileId: string, chunkIndex: number): string {
  return `${fileId}:chunk:${chunkIndex}`;
}

export function generateBatchId(projectId: string): string {
  return `${projectId}:batch:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
}

// VFS operations
export class VirtualFileSystem {
  private projectId: string;
  private projectName: string;

  constructor(projectId: string, projectName: string) {
    this.projectId = projectId;
    this.projectName = projectName;
  }

  async initializeProject(): Promise<void> {
    await db.projects.put({
      id: this.projectId,
      name: this.projectName,
      createdAt: Date.now(),
      lastModified: Date.now(),
      status: 'local'
    });
  }

  async addFileMeta(fileMeta: Omit<FileMeta, 'id' | 'projectId'>): Promise<string> {
    const id = generateFileId(this.projectId, fileMeta.path);
    
    await db.files.put({
      id,
      projectId: this.projectId,
      ...fileMeta
    });

    return id;
  }

  async getFileMeta(path: string): Promise<FileMeta | undefined> {
    const id = generateFileId(this.projectId, path);
    return await db.files.get(id);
  }

  async getProjectFiles(): Promise<FileMeta[]> {
    return await db.files.where('projectId').equals(this.projectId).toArray();
  }

  async getFileTree(): Promise<FileMeta[]> {
    const files = await this.getProjectFiles();
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  async updateFileStatus(path: string, status: FileMeta['status'], errorMessage?: string): Promise<void> {
    const id = generateFileId(this.projectId, path);
    await db.files.update(id, { 
      status, 
      errorMessage,
      uploadedAt: status === 'committed' ? Date.now() : undefined
    });
  }

  async addFileChunk(fileId: string, chunkIndex: number, blob: Blob, hash?: string): Promise<string> {
    const id = generateChunkId(fileId, chunkIndex);
    
    await db.fileChunks.put({
      id,
      fileId,
      chunkIndex,
      blob,
      size: blob.size,
      hash,
      uploaded: false
    });

    return id;
  }

  async getFileChunks(fileId: string): Promise<FileChunk[]> {
    return await db.fileChunks.where('fileId').equals(fileId).sortBy('chunkIndex');
  }

  async markChunkUploaded(fileId: string, chunkIndex: number): Promise<void> {
    const id = generateChunkId(fileId, chunkIndex);
    await db.fileChunks.update(id, { uploaded: true });
  }

  async addToSyncQueue(item: Omit<SyncQueue, 'id' | 'createdAt'>): Promise<string> {
    const id = `${this.projectId}:sync:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    
    await db.syncQueue.put({
      id,
      projectId: this.projectId,
      createdAt: Date.now(),
      ...item
    });

    return id;
  }

  async getPendingSyncItems(): Promise<SyncQueue[]> {
    return await db.syncQueue
      .where('projectId')
      .equals(this.projectId)
      .and(item => item.status === 'pending')
      .sortBy('priority');
  }

  async updateSyncItemStatus(id: string, status: SyncQueue['status'], errorMessage?: string): Promise<void> {
    await db.syncQueue.update(id, { 
      status, 
      errorMessage,
      lastAttempt: Date.now()
    });
  }

  async incrementSyncAttempts(id: string): Promise<void> {
    const item = await db.syncQueue.get(id);
    if (item) {
      await db.syncQueue.update(id, { 
        attempts: item.attempts + 1,
        lastAttempt: Date.now()
      });
    }
  }

  async createBatch(fileCount: number, totalSize: number): Promise<string> {
    const id = generateBatchId(this.projectId);
    
    await db.batches.put({
      id,
      projectId: this.projectId,
      batchHash: '', // Will be calculated
      status: 'pending',
      fileCount,
      totalSize,
      uploadedSize: 0,
      createdAt: Date.now()
    });

    return id;
  }

  async updateBatchStatus(id: string, status: Batch['status'], uploadedSize?: number, errorMessage?: string): Promise<void> {
    const updates: Partial<Batch> = { status };
    if (uploadedSize !== undefined) updates.uploadedSize = uploadedSize;
    if (errorMessage) updates.errorMessage = errorMessage;
    if (status === 'completed') updates.completedAt = Date.now();

    await db.batches.update(id, updates);
  }

  async getBatch(id: string): Promise<Batch | undefined> {
    return await db.batches.get(id);
  }

  async getActiveBatches(): Promise<Batch[]> {
    return await db.batches
      .where('projectId')
      .equals(this.projectId)
      .and(batch => ['pending', 'uploading'].includes(batch.status))
      .toArray();
  }

  // File content operations
  async getFileContent(path: string): Promise<Blob | null> {
    const fileMeta = await this.getFileMeta(path);
    if (!fileMeta || fileMeta.isDirectory) return null;

    const chunks = await this.getFileChunks(fileMeta.id);
    if (chunks.length === 0) return null;

    // Reconstruct file from chunks
    const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const blobs = sortedChunks.map(chunk => chunk.blob);
    
    return new Blob(blobs, { type: 'application/octet-stream' });
  }

  async setFileContent(path: string, content: Blob): Promise<void> {
    const fileMeta = await this.getFileMeta(path);
    if (!fileMeta) return;

    // Clear existing chunks
    await db.fileChunks.where('fileId').equals(fileMeta.id).delete();

    // Split into chunks (5MB each)
    const chunkSize = 5 * 1024 * 1024;
    const chunks: Blob[] = [];
    
    for (let i = 0; i < content.size; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    // Store chunks
    for (let i = 0; i < chunks.length; i++) {
      await this.addFileChunk(fileMeta.id, i, chunks[i]);
    }
  }

  // Cleanup operations
  async deleteProject(): Promise<void> {
    await db.transaction('rw', [db.projects, db.files, db.fileChunks, db.syncQueue, db.batches], async () => {
      await db.projects.delete(this.projectId);
      await db.files.where('projectId').equals(this.projectId).delete();
      await db.fileChunks.where('fileId').startsWith(this.projectId).delete();
      await db.syncQueue.where('projectId').equals(this.projectId).delete();
      await db.batches.where('projectId').equals(this.projectId).delete();
    });
  }

  async cleanupCompletedBatches(): Promise<void> {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    await db.batches
      .where('projectId')
      .equals(this.projectId)
      .and(batch => batch.status === 'completed' && batch.completedAt! < cutoff)
      .delete();
  }
}

// Global VFS instance
let currentVFS: VirtualFileSystem | null = null;

export function getCurrentVFS(): VirtualFileSystem | null {
  return currentVFS;
}

export function setCurrentVFS(vfs: VirtualFileSystem | null): void {
  currentVFS = vfs;
}

export function createVFS(projectId: string, projectName: string): VirtualFileSystem {
  const vfs = new VirtualFileSystem(projectId, projectName);
  setCurrentVFS(vfs);
  return vfs;
}
