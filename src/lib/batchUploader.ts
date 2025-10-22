import { FileMeta, Batch, SyncQueue, db, FILE_STATUS, SYNC_STATUS } from './vfs';

export interface UploadConfig {
  maxFilesPerBatch: number;
  maxSizePerBatch: number; // bytes
  maxConcurrentBatches: number;
  retryAttempts: number;
  retryDelay: number; // ms
  chunkSize: number; // bytes for large files
  baseUrl: string;
}

export interface UploadProgress {
  batchId: string;
  filePath: string;
  progress: number; // 0-1
  uploadedBytes: number;
  totalBytes: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  error?: string;
}

export interface UploadStats {
  totalFiles: number;
  uploadedFiles: number;
  failedFiles: number;
  totalSize: number;
  uploadedSize: number;
  startTime: number;
  endTime?: number;
  currentBatch?: string;
}

export class BatchUploader {
  private config: UploadConfig;
  private stats: UploadStats;
  private isRunning = false;
  private activeBatches = new Map<string, AbortController>();
  private worker?: Worker;

  constructor(config: Partial<UploadConfig> = {}) {
    this.config = {
      maxFilesPerBatch: 50,
      maxSizePerBatch: 20 * 1024 * 1024, // 20MB
      maxConcurrentBatches: 3,
      retryAttempts: 3,
      retryDelay: 1000,
      chunkSize: 5 * 1024 * 1024, // 5MB
      baseUrl: import.meta.env.VITE_BACKEND_URL || 'https://ai-ide-5.onrender.com',
      ...config
    };

    this.stats = {
      totalFiles: 0,
      uploadedFiles: 0,
      failedFiles: 0,
      totalSize: 0,
      uploadedSize: 0,
      startTime: 0
    };

    this.initializeWorker();
  }

  private initializeWorker() {
    try {
      // Disable worker to prevent infinite loops / unresponsive UI
      this.worker = undefined;
      console.warn('File sync worker disabled (temporary)');
    } catch (error) {
      console.warn('Could not initialize worker, falling back to main thread:', error);
    }
  }

  private handleWorkerMessage(event: MessageEvent) {
    const { type, payload } = event.data;
    
    switch (type) {
      case 'PROGRESS':
        this.onProgress?.(payload);
        break;
      case 'BATCH_COMPLETE':
        this.onBatchComplete?.(payload);
        break;
      case 'ERROR':
        this.onError?.(payload);
        break;
      case 'STATS':
        this.stats = { ...this.stats, ...payload };
        this.onStats?.(this.stats);
        break;
    }
  }

  private handleWorkerError(error: ErrorEvent) {
    console.error('Worker error:', error);
    this.onError?.({ message: 'Worker error', error: error.message });
  }

  // Event handlers (set by caller)
  public onProgress?: (progress: UploadProgress) => void;
  public onBatchComplete?: (result: any) => void;
  public onError?: (error: any) => void;
  public onStats?: (stats: UploadStats) => void;

  /**
   * Start uploading files
   */
  async startUpload(projectId: string): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.stats = {
      totalFiles: 0,
      uploadedFiles: 0,
      failedFiles: 0,
      totalSize: 0,
      uploadedSize: 0,
      startTime: Date.now()
    };

    try {
      if (this.worker) {
        // Use worker for background processing
        this.worker.postMessage({
          type: 'START_SYNC',
          payload: { projectId, config: this.config }
        });
      } else {
        // Fallback to main thread
        await this.uploadLoop(projectId);
      }
    } catch (error) {
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop uploading
   */
  stopUpload(): void {
    this.isRunning = false;
    
    // Cancel active batches
    for (const [batchId, controller] of this.activeBatches) {
      controller.abort();
    }
    this.activeBatches.clear();

    if (this.worker) {
      this.worker.postMessage({ type: 'STOP_SYNC' });
    }
  }

  /**
   * Main upload loop (fallback when worker not available)
   */
  private async uploadLoop(projectId: string): Promise<void> {
    while (this.isRunning) {
      try {
        // Get pending files
        const pendingFiles = await this.getPendingFiles(projectId);
        
        if (pendingFiles.length === 0) {
          // No files left; stop loop to avoid infinite polling
          this.isRunning = false;
          break;
        }

        // Create batches
        const batches = this.createBatches(pendingFiles);
        
        // Process batches with concurrency limit
        const batchPromises = batches.slice(0, this.config.maxConcurrentBatches)
          .map(batch => this.processBatch(batch, projectId));
        
        await Promise.allSettled(batchPromises);

        // Safety: if nothing is running anymore, break
        if (!this.isRunning) {
          break;
        }

      } catch (error) {
        console.error('Upload loop error:', error);
        // Stop on unexpected errors to prevent tight retry loops
        this.isRunning = false;
        break;
      }
    }
  }

  /**
   * Get pending files from IndexedDB
   */
  private async getPendingFiles(projectId: string): Promise<FileMeta[]> {
    return await db.files
      .where('projectId')
      .equals(projectId)
      .and(file => file.status === FILE_STATUS.PENDING)
      .toArray();
  }

  /**
   * Create batches from files
   */
  private createBatches(files: FileMeta[]): FileMeta[][] {
    const batches: FileMeta[][] = [];
    let currentBatch: FileMeta[] = [];
    let currentSize = 0;

    for (const file of files) {
      // Check if adding this file would exceed limits
      if (currentBatch.length >= this.config.maxFilesPerBatch || 
          currentSize + file.size > this.config.maxSizePerBatch) {
        
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

  /**
   * Process a single batch
   */
  private async processBatch(files: FileMeta[], projectId: string): Promise<void> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const controller = new AbortController();
    
    this.activeBatches.set(batchId, controller);
    this.stats.currentBatch = batchId;

    try {
      // Create batch record
      await db.batches.add({
        id: batchId,
        projectId,
        batchHash: '', // Will be calculated
        status: 'uploading',
        fileCount: files.length,
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
        uploadedSize: 0,
        createdAt: Date.now()
      });

      // Update stats
      this.stats.totalFiles += files.length;
      this.stats.totalSize += files.reduce((sum, file) => sum + file.size, 0);

      // Process files in batch
      for (const file of files) {
        if (!this.isRunning) break;

        try {
          await this.processFile(file, batchId, controller.signal);
          this.stats.uploadedFiles++;
          this.stats.uploadedSize += file.size;

          // Update progress
          this.onProgress?.({
            batchId,
            filePath: file.path,
            progress: this.stats.uploadedFiles / this.stats.totalFiles,
            uploadedBytes: this.stats.uploadedSize,
            totalBytes: this.stats.totalSize,
            status: 'completed'
          });

        } catch (error) {
          this.stats.failedFiles++;
          console.error(`Failed to process file ${file.path}:`, error);
          
          // Update file status
          await this.updateFileStatus(file.id, FILE_STATUS.ERROR, error instanceof Error ? error.message : 'Unknown error');
        }
      }

      // Mark batch as complete
      await this.updateBatchStatus(batchId, 'completed');
      
      this.onBatchComplete?.({
        batchId,
        filesProcessed: files.length,
        stats: { ...this.stats }
      });

    } catch (error) {
      await this.updateBatchStatus(batchId, 'failed', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      this.activeBatches.delete(batchId);
    }
  }

  /**
   * Process a single file
   */
  private async processFile(file: FileMeta, batchId: string, signal: AbortSignal): Promise<void> {
    // Update file status to uploading
    await this.updateFileStatus(file.id, FILE_STATUS.UPLOADING);

    try {
      // Read file content
      const content = await this.readFileContent(file);
      if (!content) {
        throw new Error('Could not read file content');
      }

      // Calculate hash
      const hash = await this.calculateHash(content);

      // Upload file
      await this.uploadFile(file, content, hash, signal);

      // Update file status
      await this.updateFileStatus(file.id, FILE_STATUS.UPLOADED);

    } catch (error) {
      await this.updateFileStatus(file.id, FILE_STATUS.ERROR, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Read file content from IndexedDB or File System Access API
   */
  private async readFileContent(file: FileMeta): Promise<Uint8Array | null> {
    try {
      // Try to get from IndexedDB chunks first
      const chunks = await db.fileChunks.where('fileId').equals(file.id).sortBy('chunkIndex');
      
      if (chunks.length > 0) {
        // Reconstruct from chunks
        const blobs = chunks.map(chunk => chunk.blob);
        const combinedBlob = new Blob(blobs);
        const arrayBuffer = await combinedBlob.arrayBuffer();
        return new Uint8Array(arrayBuffer);
      }

      // Fallback: try to read from File System Access API
      // This would need to be implemented based on how files were originally accessed
      return null;

    } catch (error) {
      console.error('Error reading file content:', error);
      return null;
    }
  }

  /**
   * Calculate file hash
   */
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

  /**
   * Upload file to server
   */
  private async uploadFile(file: FileMeta, content: Uint8Array, hash: string, signal: AbortSignal): Promise<void> {
    try {
      // For large files, use chunked upload
      if (content.length > this.config.chunkSize) {
        await this.uploadFileChunked(file, content, hash, signal);
      } else {
        await this.uploadFileSingle(file, content, hash, signal);
      }

    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }

  /**
   * Upload file as single request
   */
  private async uploadFileSingle(file: FileMeta, content: Uint8Array, hash: string, signal: AbortSignal): Promise<void> {
    const formData = new FormData();
    formData.append('file', new Blob([content]), file.path);
    formData.append('path', file.path);
    formData.append('size', file.size.toString());
    formData.append('mtime', file.mtime.toString());
    formData.append('hash', hash);

    const authUser = localStorage.getItem('auth_user')
    const sessionId = authUser ? JSON.parse(authUser).sessionId : undefined
    const token = authUser ? JSON.parse(authUser).terminalToken : undefined
    const response = await fetch(`${this.config.baseUrl}/api/files/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        ...(sessionId ? { 'x-session-id': sessionId } : {}),
        ...(token ? { 'x-terminal-token': token } : {}),
      },
      signal
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Upload file in chunks
   */
  private async uploadFileChunked(file: FileMeta, content: Uint8Array, hash: string, signal: AbortSignal): Promise<void> {
    const chunkSize = this.config.chunkSize;
    const totalChunks = Math.ceil(content.length / chunkSize);
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, content.length);
      const chunk = content.slice(start, end);

      const formData = new FormData();
      formData.append('file', new Blob([chunk]), `${file.path}.chunk.${i}`);
      formData.append('path', file.path);
      formData.append('chunkIndex', i.toString());
      formData.append('totalChunks', totalChunks.toString());
      formData.append('uploadId', uploadId);
      formData.append('hash', hash);

      const authUser = localStorage.getItem('auth_user')
      const sessionId = authUser ? JSON.parse(authUser).sessionId : undefined
      const token = authUser ? JSON.parse(authUser).terminalToken : undefined
      const response = await fetch(`${this.config.baseUrl}/api/files/upload-chunk`, {
        method: 'POST',
        body: formData,
        signal,
        headers: {
          ...(sessionId ? { 'x-session-id': sessionId } : {}),
          ...(token ? { 'x-terminal-token': token } : {}),
        }
      });

      if (!response.ok) {
        throw new Error(`Chunk upload failed: ${response.status} ${response.statusText}`);
      }
    }

    // Complete upload
    const authUser2 = localStorage.getItem('auth_user')
    const sessionId2 = authUser2 ? JSON.parse(authUser2).sessionId : undefined
    const token2 = authUser2 ? JSON.parse(authUser2).terminalToken : undefined
    const completeResponse = await fetch(`${this.config.baseUrl}/api/files/upload-complete`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(sessionId2 ? { 'x-session-id': sessionId2 } : {}),
        ...(token2 ? { 'x-terminal-token': token2 } : {}),
      },
      body: JSON.stringify({
        path: file.path,
        uploadId,
        totalChunks,
        hash
      }),
      signal
    });

    if (!completeResponse.ok) {
      throw new Error(`Upload completion failed: ${completeResponse.status} ${completeResponse.statusText}`);
    }
  }

  /**
   * Update file status in IndexedDB
   */
  private async updateFileStatus(fileId: string, status: string, errorMessage?: string): Promise<void> {
    await db.files.update(fileId, { 
      status, 
      errorMessage,
      uploadedAt: status === FILE_STATUS.UPLOADED ? Date.now() : undefined
    });
  }

  /**
   * Update batch status in IndexedDB
   */
  private async updateBatchStatus(batchId: string, status: string, errorMessage?: string): Promise<void> {
    const updates: Partial<Batch> = { status };
    if (errorMessage) updates.errorMessage = errorMessage;
    if (status === 'completed') updates.completedAt = Date.now();

    await db.batches.update(batchId, updates);
  }

  /**
   * Retry failed uploads
   */
  async retryFailed(projectId: string): Promise<void> {
    const failedFiles = await db.files
      .where('projectId')
      .equals(projectId)
      .and(file => file.status === FILE_STATUS.ERROR)
      .toArray();

    if (failedFiles.length > 0) {
      // Reset status to pending
      await db.files
        .where('projectId')
        .equals(projectId)
        .and(file => file.status === FILE_STATUS.ERROR)
        .modify({ status: FILE_STATUS.PENDING, errorMessage: undefined });

      // Start upload again
      await this.startUpload(projectId);
    }
  }

  /**
   * Get current upload statistics
   */
  getStats(): UploadStats {
    return { ...this.stats };
  }

  /**
   * Check if upload is running
   */
  isUploading(): boolean {
    return this.isRunning;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopUpload();
    this.worker?.terminate();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a batch uploader instance
 */
export function createBatchUploader(config?: Partial<UploadConfig>): BatchUploader {
  return new BatchUploader(config);
}
