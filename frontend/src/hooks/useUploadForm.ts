'use client';

import { useState, useCallback } from 'react';
import { useUploadContext } from '@/contexts/UploadContext';
import { useToast } from '@/hooks/useToast';
import { getErrorMessage } from '@/lib/utils';

export interface UploadFormState {
  title: string;
  description: string;
  isPublic: boolean;
  publicRole: 'viewer' | 'editor';
}

const initialFormState: UploadFormState = {
  title: '',
  description: '',
  isPublic: false,
  publicRole: 'viewer',
};

export function useUploadForm() {
  const { addUpload } = useUploadContext();
  const { success, error: showError } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [formData, setFormData] = useState<UploadFormState>(initialFormState);

  const handleFilesAdded = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setSelectedFiles(files);
    setFormData((prev) => {
      if (files.length === 1 && !prev.title) {
        const title = files[0].name.replace(/\.[^/.]+$/, '');
        return { ...prev, title };
      }
      return prev;
    });
    setShowForm(true);
  }, []);

  const handleStartUpload = useCallback(async (): Promise<boolean> => {
    const title = formData.title.trim();
    if (!title || selectedFiles.length === 0) return false;

    let hasError = false;
    for (const file of selectedFiles) {
      const fileTitle =
        selectedFiles.length === 1 ? title : `${title} (${file.name})`;
      try {
        await addUpload(
          file,
          fileTitle,
          formData.description || undefined,
          formData.isPublic,
          formData.publicRole
        );
      } catch (err: unknown) {
        hasError = true;
        showError(getErrorMessage(err));
      }
    }

    if (!hasError && selectedFiles.length > 0) {
      success(
        selectedFiles.length === 1
          ? 'Upload started'
          : `${selectedFiles.length} uploads started`
      );
    }

    setFormData(initialFormState);
    setSelectedFiles([]);
    setShowForm(false);
    return !hasError;
  }, [formData, selectedFiles, addUpload, success, showError]);

  const handleCancelForm = useCallback(() => {
    setShowForm(false);
    setSelectedFiles([]);
    setFormData(initialFormState);
  }, []);

  return {
    showForm,
    selectedFiles,
    formData,
    setFormData,
    handleFilesAdded,
    handleStartUpload,
    handleCancelForm,
  };
}
