// Web Worker for background file processing and uploads
// This runs in a separate thread to avoid blocking the UI

import { FileMeta, FILE_STATUS, SYNC_STATUS } from '../lib/vfs';

export interface WorkerMessage {
  type: 'START_SYNC' | 'STOP_SYNC' | 'PROCESS_BATCH' | 'RETRY_FAILED';
  payload?: any;
}

export interface WorkerResponse {
  type: 'PROGRESS' | 'BATCH_COMPLETE' | 'ERROR' | 'STATS';
  payload?: any;
}

export interface BatchConfig {
  maxFiles: number;
  maxSize: number; // bytes
  concurrency: number;
  retryAttempts: number;
  retryDelay: number; // ms
}

export interface SyncStats {
  totalFiles: number;
  processedFiles: number;
  uploadedFiles: number;
  failedFiles: number;
  totalSize: number;
  uploadedSize: number;
  startTime: number;
  currentBatch?: string;
}

class FileSyncWorker {
  private isRunning = false;
  private stats: SyncStats;
  private config: BatchConfig;
  private abortController?: AbortController;

  constructor() {
    this.config = {
      maxFiles: 50,
      maxSize: 20 * 1024 * 1024, // 20MB
      concurrency: 3,
      retryAttempts: 3,
      retryDelay: 1000
    };

    this.stats = {
      totalFiles: 0,
      processedFiles: 0,
      uploadedFiles: 0,
      failedFiles: 0,
      totalSize: 0,
      uploadedSize: 0,
      startTime: 0
    };

    this.setupMessageHandler();
  }

  private setupMessageHandler() {
    self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
      this.handleMessage(event.data);
    });
  }

  private handleMessage(message: WorkerMessage) {
    switch (message.type) {
      case 'START_SYNC':
        this.startSync(message.payload);
        break;
      case 'STOP_SYNC':
        this.stopSync();
        break;
      case 'PROCESS_BATCH':
        this.processBatch(message.payload);
        break;
      case 'RETRY_FAILED':
        this.retryFailed();
        break;
    }
  }

  private async startSync(config?: Partial<BatchConfig>) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.config = { ...this.config, ...config };
    this.stats = {
      totalFiles: 0,
      processedFiles: 0,
      uploadedFiles: 0,
      failedFiles: 0,
      totalSize: 0,
      uploadedSize: 0,
      startTime: Date.now()
    };

    this.abortController = new AbortController();

    try {
      await this.syncLoop();
    } catch (error) {
      this.sendResponse({
        type: 'ERROR',
        payload: { message: 'Sync failed', error: error instanceof Error ? error.message : 'Unknown error' }
      });
    } finally {
      this.isRunning = false;
    }
  }

  private stopSync() {
    this.isRunning = false;
    this.abortController?.abort();
  }

  private async syncLoop() {
    while (this.isRunning) {
      try {
        // Get pending files from IndexedDB
        const pendingFiles = await this.getPendingFiles();
        
        if (pendingFiles.length === 0) {
          // No more files to process, stop the loop
          this.isRunning = false;
          break;
        }

        // Create batches
        const batches = this.createBatches(pendingFiles);
        
        // Process batches concurrently
        const batchPromises = batches.map(batch => this.processBatch(batch));
        await Promise.allSettled(batchPromises);

        // Update stats
        this.sendResponse({
          type: 'STATS',
          payload: this.stats
        });

        // After processing all files, stop the loop
        this.isRunning = false;
        break;

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          break; // Sync was stopped
        }
        
        this.sendResponse({
          type: 'ERROR',
          payload: { message: 'Batch processing error', error: error instanceof Error ? error.message : 'Unknown error' }
        });
        
        // Stop on error to prevent infinite loops
        this.isRunning = false;
        break;
      }
    }
  }

  private async getPendingFiles(): Promise<FileMeta[]> {
    // This would normally query IndexedDB, but in a worker we need to use postMessage
    // For now, we'll simulate this by returning empty array to prevent infinite loops
    // In a real implementation, this would query the sync queue from IndexedDB
    return [];
  }

  private createBatches(files: FileMeta[]): FileMeta[][] {
    const batches: FileMeta[][] = [];
    let currentBatch: FileMeta[] = [];
    let currentSize = 0;

    for (const file of files) {
      // Check if adding this file would exceed limits
      if (currentBatch.length >= this.config.maxFiles || 
          currentSize + file.size > this.config.maxSize) {
        
        if (currentBatch.length > 0) {
          batches.push([...currentBatch]);
          currentBatch = [];
          currentSize = 0;
        }
      }

      currentBatch.push(file);
      currentSize += file.size;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  private async processBatch(files: FileMeta[]) {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.stats.currentBatch = batchId;
    this.stats.totalFiles += files.length;
    this.stats.totalSize += files.reduce((sum, file) => sum + file.size, 0);

    try {
      // Process files in the batch
      for (const file of files) {
        if (!this.isRunning) break;

        try {
          await this.processFile(file);
          this.stats.processedFiles++;
          this.stats.uploadedFiles++;
          this.stats.uploadedSize += file.size;
        } catch (error) {
          this.stats.failedFiles++;
          console.error(`Failed to process file ${file.path}:`, error);
        }

        // Send progress update
        this.sendResponse({
          type: 'PROGRESS',
          payload: {
            batchId,
            file: file.path,
            progress: this.stats.processedFiles / this.stats.totalFiles,
            stats: { ...this.stats }
          }
        });
      }

      // Mark batch as complete
      this.sendResponse({
        type: 'BATCH_COMPLETE',
        payload: {
          batchId,
          filesProcessed: files.length,
          stats: { ...this.stats }
        }
      });

    } catch (error) {
      this.sendResponse({
        type: 'ERROR',
        payload: {
          batchId,
          message: 'Batch processing failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  private async processFile(file: FileMeta): Promise<void> {
    // Read file content
    const content = await this.readFileContent(file);
    if (!content) {
      throw new Error('Could not read file content');
    }

    // Calculate hash
    const hash = await this.calculateHash(content);

    // Upload file
    await this.uploadFile(file, content, hash);

    // Update file status in IndexedDB
    await this.updateFileStatus(file.id, FILE_STATUS.UPLOADED);
  }

  private async readFileContent(file: FileMeta): Promise<Uint8Array | null> {
    try {
      // In a real implementation, this would read from IndexedDB or File System Access API
      // For now, we'll simulate this
      return new Uint8Array(0);
    } catch (error) {
      console.error('Error reading file content:', error);
      return null;
    }
  }

  private async calculateHash(content: Uint8Array): Promise<string> {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', content);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('Error calculating hash:', error);
      return '';
    }
  }

  private async uploadFile(file: FileMeta, content: Uint8Array, hash: string): Promise<void> {
    try {
      // Create FormData for upload
      const formData = new FormData();
      formData.append('file', new Blob([content]), file.path);
      formData.append('path', file.path);
      formData.append('size', file.size.toString());
      formData.append('mtime', file.mtime.toString());
      formData.append('hash', hash);

      // Upload to server
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
        signal: this.abortController?.signal
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }

  private async updateFileStatus(fileId: string, status: string): Promise<void> {
    // In a real implementation, this would update IndexedDB
    // For now, we'll simulate this
    console.log(`Updating file ${fileId} status to ${status}`);
  }

  private async retryFailed() {
    // Get failed files and retry them
    const failedFiles = await this.getFailedFiles();
    
    if (failedFiles.length > 0) {
      const batches = this.createBatches(failedFiles);
      const batchPromises = batches.map(batch => this.processBatch(batch));
      await Promise.allSettled(batchPromises);
    }
  }

  private async getFailedFiles(): Promise<FileMeta[]> {
    // This would query IndexedDB for failed files
    return [];
  }

  private sendResponse(response: WorkerResponse) {
    self.postMessage(response);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize worker - it will only start when explicitly told to via messages
const worker = new FileSyncWorker();
