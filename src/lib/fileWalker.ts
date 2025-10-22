import { FileMeta, shouldIgnoreFile, DEFAULT_IGNORE_PATTERNS } from './vfs';

export interface FileEntry {
  file: File;
  webkitRelativePath?: string;
}

export interface WalkResult {
  files: FileMeta[];
  totalSize: number;
  fileCount: number;
  directoryCount: number;
  ignoredCount: number;
  errors: string[];
}

export interface WalkOptions {
  customIgnorePatterns?: string[];
  maxFileSize?: number; // Skip files larger than this (bytes)
  includeHidden?: boolean;
  onProgress?: (progress: WalkProgress) => void;
}

export interface WalkProgress {
  currentPath: string;
  filesProcessed: number;
  totalFiles: number;
  currentSize: number;
  totalSize: number;
}

/**
 * Fast file walker that only reads metadata, not content
 * Uses File API and webkitGetAsEntry for efficient traversal
 */
export class FileWalker {
  private options: WalkOptions;
  private customIgnorePatterns: string[];

  constructor(options: WalkOptions = {}) {
    this.options = {
      maxFileSize: 100 * 1024 * 1024, // 100MB default
      includeHidden: false,
      ...options
    };
    this.customIgnorePatterns = options.customIgnorePatterns || [];
  }

  /**
   * Walk a dropped folder or file list
   */
  async walkFiles(files: FileList | FileEntry[]): Promise<WalkResult> {
    const result: WalkResult = {
      files: [],
      totalSize: 0,
      fileCount: 0,
      directoryCount: 0,
      ignoredCount: 0,
      errors: []
    };

    try {
      // Convert FileList to array for easier processing
      const fileArray = Array.from(files);
      
      // Use requestIdleCallback to avoid blocking UI
      await this.walkFilesWithIdleCallback(fileArray, result);
      
    } catch (error) {
      result.errors.push(`Walk error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Walk files using requestIdleCallback to avoid UI blocking
   */
  private async walkFilesWithIdleCallback(
    files: FileEntry[], 
    result: WalkResult
  ): Promise<void> {
    const totalFiles = files.length;
    let processedFiles = 0;

    for (const fileEntry of files) {
      await new Promise<void>((resolve) => {
        requestIdleCallback(async () => {
          try {
            await this.processFileEntry(fileEntry, result);
            processedFiles++;
            
            // Report progress
            if (this.options.onProgress) {
              this.options.onProgress({
                currentPath: fileEntry.file.name,
                filesProcessed: processedFiles,
                totalFiles,
                currentSize: result.totalSize,
                totalSize: result.totalSize // Will be updated as we go
              });
            }
            
            resolve();
          } catch (error) {
            result.errors.push(`Error processing ${fileEntry.file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            resolve();
          }
        });
      });
    }
  }

  /**
   * Process a single file entry (file or directory)
   */
  private async processFileEntry(fileEntry: FileEntry, result: WalkResult): Promise<void> {
    const file = fileEntry.file;
    const relativePath = fileEntry.webkitRelativePath || file.name;

    // Check if file should be ignored
    if (shouldIgnoreFile(relativePath, this.customIgnorePatterns)) {
      result.ignoredCount++;
      return;
    }

    // Check file size limit
    if (this.options.maxFileSize && file.size > this.options.maxFileSize) {
      result.errors.push(`File too large: ${relativePath} (${file.size} bytes)`);
      return;
    }

    // Check if hidden file (starts with .)
    if (!this.options.includeHidden && file.name.startsWith('.')) {
      result.ignoredCount++;
      return;
    }

    // Create file metadata
    const fileMeta: FileMeta = {
      id: '', // Will be set by VFS
      projectId: '', // Will be set by VFS
      path: relativePath,
      name: file.name,
      size: file.size,
      mtime: file.lastModified,
      isDirectory: false, // Files from FileList are never directories
      status: 'pending'
    };

    result.files.push(fileMeta);
    result.totalSize += file.size;
    result.fileCount++;
  }

  /**
   * Walk a directory using File System Access API (if available)
   * This is more efficient for large directory trees
   */
  async walkDirectory(directoryHandle: FileSystemDirectoryHandle): Promise<WalkResult> {
    const result: WalkResult = {
      files: [],
      totalSize: 0,
      fileCount: 0,
      directoryCount: 0,
      ignoredCount: 0,
      errors: []
    };

    try {
      await this.walkDirectoryRecursive(directoryHandle, '', result);
    } catch (error) {
      result.errors.push(`Directory walk error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Recursively walk a directory
   */
  private async walkDirectoryRecursive(
    directoryHandle: FileSystemDirectoryHandle,
    currentPath: string,
    result: WalkResult
  ): Promise<void> {
    const entries = await directoryHandle.values();
    
    for await (const entry of entries) {
      const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

      // Check if entry should be ignored
      if (shouldIgnoreFile(entryPath, this.customIgnorePatterns)) {
        result.ignoredCount++;
        continue;
      }

      // Check if hidden file/directory
      if (!this.options.includeHidden && entry.name.startsWith('.')) {
        result.ignoredCount++;
        continue;
      }

      if (entry.kind === 'file') {
        try {
          const file = await entry.getFile();
          
          // Check file size limit
          if (this.options.maxFileSize && file.size > this.options.maxFileSize) {
            result.errors.push(`File too large: ${entryPath} (${file.size} bytes)`);
            continue;
          }

          const fileMeta: FileMeta = {
            id: '', // Will be set by VFS
            projectId: '', // Will be set by VFS
            path: entryPath,
            name: entry.name,
            size: file.size,
            mtime: file.lastModified,
            isDirectory: false,
            status: 'pending'
          };

          result.files.push(fileMeta);
          result.totalSize += file.size;
          result.fileCount++;

          // Report progress
          if (this.options.onProgress) {
            this.options.onProgress({
              currentPath: entryPath,
              filesProcessed: result.fileCount,
              totalFiles: result.fileCount, // We don't know total ahead of time
              currentSize: result.totalSize,
              totalSize: result.totalSize
            });
          }

        } catch (error) {
          result.errors.push(`Error reading file ${entryPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else if (entry.kind === 'directory') {
        result.directoryCount++;
        await this.walkDirectoryRecursive(entry, entryPath, result);
      }
    }
  }

  /**
   * Walk files from a DataTransfer (drag and drop)
   */
  async walkDataTransfer(dataTransfer: DataTransfer): Promise<WalkResult> {
    const result: WalkResult = {
      files: [],
      totalSize: 0,
      fileCount: 0,
      directoryCount: 0,
      ignoredCount: 0,
      errors: []
    };

    try {
      // Check if File System Access API is available
      if ('showDirectoryPicker' in window) {
        // Use File System Access API for better performance
        const items = Array.from(dataTransfer.items);
        
        for (const item of items) {
          if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry();
            if (entry) {
              if (entry.isFile) {
                const file = await this.entryToFile(entry);
                if (file) {
                  await this.processFileEntry({ file, webkitRelativePath: entry.fullPath }, result);
                }
              } else if (entry.isDirectory) {
                await this.walkDirectoryEntry(entry, result);
              }
            }
          }
        }
      } else {
        // Fallback to FileList
        const files = Array.from(dataTransfer.files);
        const fileEntries = files.map(file => ({ file }));
        return await this.walkFiles(fileEntries);
      }
    } catch (error) {
      result.errors.push(`DataTransfer walk error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Walk a directory entry (webkitGetAsEntry)
   */
  private async walkDirectoryEntry(entry: FileSystemEntry, result: WalkResult): Promise<void> {
    if (!entry.isDirectory) return;

    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await this.readDirectoryEntries(reader);

    for (const subEntry of entries) {
      const entryPath = entry.fullPath + '/' + subEntry.name;

      // Check if entry should be ignored
      if (shouldIgnoreFile(entryPath, this.customIgnorePatterns)) {
        result.ignoredCount++;
        continue;
      }

      // Check if hidden file/directory
      if (!this.options.includeHidden && subEntry.name.startsWith('.')) {
        result.ignoredCount++;
        continue;
      }

      if (subEntry.isFile) {
        const file = await this.entryToFile(subEntry);
        if (file) {
          await this.processFileEntry({ file, webkitRelativePath: entryPath }, result);
        }
      } else if (subEntry.isDirectory) {
        result.directoryCount++;
        await this.walkDirectoryEntry(subEntry, result);
      }
    }
  }

  /**
   * Read directory entries with promise
   */
  private readDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
    return new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
  }

  /**
   * Convert FileSystemEntry to File
   */
  private async entryToFile(entry: FileSystemEntry): Promise<File | null> {
    return new Promise((resolve) => {
      if (entry.isFile) {
        (entry as FileSystemFileEntry).file(resolve, () => resolve(null));
      } else {
        resolve(null);
      }
    });
  }

  /**
   * Get file content for small files only
   */
  async getFileContent(file: File): Promise<Uint8Array | null> {
    // Only read content for small files (< 1MB)
    if (file.size > 1024 * 1024) {
      return null;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (error) {
      console.error('Error reading file content:', error);
      return null;
    }
  }

  /**
   * Calculate file hash (SHA-256)
   */
  async calculateFileHash(file: File): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('Error calculating file hash:', error);
      return '';
    }
  }
}

/**
 * Utility function to create a file walker with sensible defaults
 */
export function createFileWalker(options?: WalkOptions): FileWalker {
  return new FileWalker(options);
}

/**
 * Quick walk function for simple use cases
 */
export async function walkFiles(
  files: FileList | FileEntry[],
  options?: WalkOptions
): Promise<WalkResult> {
  const walker = createFileWalker(options);
  return await walker.walkFiles(files);
}

/**
 * Quick walk function for drag and drop
 */
export async function walkDataTransfer(
  dataTransfer: DataTransfer,
  options?: WalkOptions
): Promise<WalkResult> {
  const walker = createFileWalker(options);
  return await walker.walkDataTransfer(dataTransfer);
}
