'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { videoApi } from '@/lib/api';
import type { UploadSession, UploadChunk } from '@/types/video';

const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_CONCURRENT_CHUNKS = 4;
const MAX_RETRIES = 3;

function createChunks(file: File): UploadChunk[] {
  const chunks: UploadChunk[] = [];
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    chunks.push({
      partNumber: i + 1,
      start,
      end,
      status: 'pending',
      retries: 0,
    });
  }
  return chunks;
}

function completedProgress(chunks: UploadChunk[]): number {
  const completed = chunks.filter((c) => c.status === 'complete').length;
  return chunks.length === 0 ? 0 : Math.round((completed / chunks.length) * 100);
}

export interface UseUploadOptions {
  onUploadComplete?: (videoId: string) => void;
}

export function useUpload(options?: UseUploadOptions) {
  const [uploads, setUploads] = useState<UploadSession[]>([]);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const isMountedRef = useRef(true);
  const onUploadCompleteRef = useRef(options?.onUploadComplete);
  onUploadCompleteRef.current = options?.onUploadComplete;

  const updateUpload = useCallback((videoId: string, updates: Partial<UploadSession>) => {
    setUploads((prev) =>
      prev.map((u) => (u.videoId === videoId ? { ...u, ...updates } : u))
    );
  }, []);

  const updateChunk = useCallback((videoId: string, partNumber: number, updates: Partial<UploadChunk>) => {
    setUploads((prev) =>
      prev.map((u) => {
        if (u.videoId !== videoId) return u;
        const chunks = u.chunks.map((c) =>
          c.partNumber === partNumber ? { ...c, ...updates } : c
        );
        const progress = completedProgress(chunks);
        return { ...u, chunks, progress };
      })
    );
  }, []);

  const uploadSingleChunk = useCallback(
    async (
      videoId: string,
      chunk: UploadChunk,
      signedUrl: string,
      file: File,
      signal: AbortSignal
    ): Promise<{ etag: string; partNumber: number }> => {
      const blob = file.slice(chunk.start, chunk.end);
      const response = await fetch(signedUrl, {
        method: 'PUT',
        body: blob,
        signal,
      });
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      const etag = response.headers.get('ETag');
      if (!etag) throw new Error('No ETag received');
      return { etag: etag.replace(/"/g, ''), partNumber: chunk.partNumber };
    },
    []
  );

  const runWithConcurrency = useCallback(
    async <T, R>(
      items: T[],
      concurrency: number,
      fn: (item: T, index: number) => Promise<R>,
      signal: AbortSignal
    ): Promise<R[]> => {
      const results: (R | undefined)[] = new Array(items.length);
      let nextIndex = 0;

      const runOne = async (): Promise<void> => {
        while (!signal.aborted && nextIndex < items.length) {
          const i = nextIndex++;
          const item = items[i];
          results[i] = await fn(item, i);
        }
      };

      const workers = Array.from(
        { length: Math.min(concurrency, items.length) },
        () => runOne()
      );
      await Promise.all(workers);
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return results as R[];
    },
    []
  );

  const processUpload = useCallback(
    async (upload: UploadSession) => {
      const controller = new AbortController();
      abortControllersRef.current.set(upload.videoId, controller);
      const signal = controller.signal;

      try {
        updateUpload(upload.videoId, { status: 'uploading' });

        const signedResponses = await Promise.all(
          upload.chunks.map((chunk) =>
            videoApi.signPart({
              key: upload.key,
              uploadId: upload.uploadId,
              partNumber: chunk.partNumber,
            })
          )
        );

        if (signal.aborted) return;

        const signedUrls = signedResponses.map((r) => r.data.url);
        const completedParts = await runWithConcurrency(
          upload.chunks,
          MAX_CONCURRENT_CHUNKS,
          async (chunk, i) => {
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            const url = signedUrls[i];
            let lastError: Error | null = null;
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
              if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
              try {
                updateChunk(upload.videoId, chunk.partNumber, {
                  status: 'uploading',
                  retries: attempt,
                });
                const result = await uploadSingleChunk(
                  upload.videoId,
                  chunk,
                  url,
                  upload.file,
                  signal
                );
                updateChunk(upload.videoId, chunk.partNumber, {
                  status: 'complete',
                  etag: result.etag,
                });
                return { ETag: result.etag, PartNumber: result.partNumber };
              } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                if (err instanceof DOMException && err.name === 'AbortError') throw err;
                updateChunk(upload.videoId, chunk.partNumber, {
                  status: attempt < MAX_RETRIES ? 'pending' : 'error',
                  retries: attempt + 1,
                });
              }
            }
            throw lastError ?? new Error('Chunk upload failed');
          },
          signal
        );

        if (signal.aborted) return;

        const sorted = [...completedParts].sort((a, b) => a.PartNumber - b.PartNumber);
        if (sorted.length !== upload.chunks.length) {
          throw new Error(`Incomplete: ${sorted.length}/${upload.chunks.length} parts`);
        }

        await videoApi.completeMultipart({
          videoId: upload.videoId,
          key: upload.key,
          uploadId: upload.uploadId,
          parts: sorted,
        });

        if (upload.isPublic) {
          await videoApi.setPublicAccess(upload.videoId, {
            enabled: true,
            role: upload.publicRole,
          });
        }

        if (!isMountedRef.current || signal.aborted) return;
        updateUpload(upload.videoId, { status: 'complete', progress: 100 });
        onUploadCompleteRef.current?.(upload.videoId);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          updateUpload(upload.videoId, {
            status: 'error',
            error: 'Upload cancelled',
          });
        } else {
          const message = err instanceof Error ? err.message : 'Upload failed';
          updateUpload(upload.videoId, { status: 'error', error: message });
        }
      } finally {
        abortControllersRef.current.delete(upload.videoId);
      }
    },
    [updateUpload, updateChunk, uploadSingleChunk, runWithConcurrency]
  );

  const addUpload = useCallback(
    async (
      file: File,
      title: string,
      description?: string,
      isPublic = false,
      publicRole: 'viewer' | 'editor' = 'viewer'
    ): Promise<string> => {
      const initResponse = await videoApi.initializeMultipart({
        fileName: file.name,
        fileType: file.type,
        title,
        description,
      });

      const { videoId, uploadId, key } = initResponse.data;
      const chunks = createChunks(file);

      const newUpload: UploadSession = {
        videoId,
        uploadId,
        key,
        file,
        title,
        description,
        isPublic,
        publicRole,
        chunks,
        status: 'pending',
        progress: 0,
      };

      setUploads((prev) => [...prev, newUpload]);
      processUpload(newUpload);
      return videoId;
    },
    [processUpload]
  );

  const cancelUpload = useCallback((videoId: string) => {
    const controller = abortControllersRef.current.get(videoId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(videoId);
    }
    updateUpload(videoId, { status: 'error', error: 'Upload cancelled' });
  }, [updateUpload]);

  const removeUpload = useCallback((videoId: string) => {
    const controller = abortControllersRef.current.get(videoId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(videoId);
    }
    setUploads((prev) => prev.filter((u) => u.videoId !== videoId));
  }, []);

  const clearUploads = useCallback(() => {
    abortControllersRef.current.forEach((c) => c.abort());
    abortControllersRef.current.clear();
    setUploads([]);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    uploads,
    addUpload,
    cancelUpload,
    removeUpload,
    clearUploads,
  };
}
