import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { api } from '../../api/axios';
import { formatRelativeTime } from '../../utils/formatActivity';
import {
  Paperclip,
  UploadCloud,
  FileText,
  FileImage,
  FileArchive,
  File,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Link2,
  ExternalLink,
  Plus,
} from 'lucide-react';

/**
 * Format bytes into readable string (e.g. 1.2 MB, 450 KB).
 */
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Returns an icon and theme based on file mimeType / filename extension.
 */
export const getFileMeta = (filename = '', mimeType = '') => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (
    mimeType.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
  ) {
    return {
      icon: FileImage,
      color: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
      isImage: true,
    };
  }

  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return {
      icon: FileText,
      color: 'text-red-500 bg-red-500/10 border-red-500/20',
      isImage: false,
    };
  }

  if (
    mimeType.includes('zip') ||
    mimeType.includes('tar') ||
    ['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)
  ) {
    return {
      icon: FileArchive,
      color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      isImage: false,
    };
  }

  return {
    icon: File,
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    isImage: false,
  };
};

export const TaskAttachments = ({
  taskId,
  currentUserRole = 'viewer',
  onAttachmentsCountChange,
}) => {
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();

  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Link Attachment State
  const [mode, setMode] = useState('file'); // 'file' | 'link'
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [addingLink, setAddingLink] = useState(false);

  const fileInputRef = useRef(null);

  // Fetch task attachments
  const fetchAttachments = useCallback(async () => {
    if (!taskId) return;

    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`/tasks/${taskId}/attachments`);
      const list = data.attachments || [];
      setAttachments(list);
      onAttachmentsCountChange?.(list.length);
    } catch (err) {
      console.error('Failed to load attachments:', err);
      setError(err.response?.data?.message || 'Failed to load attachments.');
    } finally {
      setLoading(false);
    }
  }, [taskId, onAttachmentsCountChange]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  // Real-time socket updates filtered by taskId
  useEffect(() => {
    if (!socket || !taskId) return;

    const handleRemoteAttachmentCreated = (data) => {
      if (data?.taskId?.toString() === taskId?.toString() && data.attachment) {
        setAttachments((prev) => {
          if (prev.some((a) => a._id?.toString() === data.attachment._id?.toString())) {
            return prev;
          }
          const updated = [data.attachment, ...prev];
          onAttachmentsCountChange?.(updated.length);
          return updated;
        });
      }
    };

    const handleRemoteAttachmentDeleted = (data) => {
      if (data?.taskId?.toString() === taskId?.toString() && data.attachmentId) {
        setAttachments((prev) => {
          const updated = prev.filter(
            (a) => a._id?.toString() !== data.attachmentId.toString()
          );
          onAttachmentsCountChange?.(updated.length);
          return updated;
        });
      }
    };

    socket.on('attachment:created', handleRemoteAttachmentCreated);
    socket.on('attachment:deleted', handleRemoteAttachmentDeleted);

    return () => {
      socket.off('attachment:created', handleRemoteAttachmentCreated);
      socket.off('attachment:deleted', handleRemoteAttachmentDeleted);
    };
  }, [socket, taskId, onAttachmentsCountChange]);

  // Perform file upload
  const handleUploadFile = async (file) => {
    if (!file || currentUserRole === 'viewer' || uploading) return;

    // Client-side 10MB check
    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds the 10MB limit.');
      return;
    }

    try {
      setUploading(true);
      setError('');
      setUploadProgress(15);

      const formData = new FormData();
      formData.append('file', file);

      const { data } = await api.post(`/tasks/${taskId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });

      if (data?.attachment) {
        setAttachments((prev) => {
          if (prev.some((a) => a._id?.toString() === data.attachment._id?.toString())) {
            return prev;
          }
          const updated = [data.attachment, ...prev];
          onAttachmentsCountChange?.(updated.length);
          return updated;
        });
      }
    } catch (err) {
      console.error('Failed to upload attachment:', err);
      setError(err.response?.data?.message || 'Failed to upload attachment.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Perform link attachment
  const handleAddLink = async (e) => {
    e?.preventDefault?.();
    if (!linkUrl.trim() || currentUserRole === 'viewer' || addingLink) return;

    let url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    try {
      new URL(url);
    } catch {
      setError('Invalid URL format. Please enter a valid web address.');
      return;
    }

    try {
      setAddingLink(true);
      setError('');
      const { data } = await api.post(`/tasks/${taskId}/attachments/link`, {
        url,
        title: linkTitle.trim() || url,
      });

      if (data?.attachment) {
        setAttachments((prev) => {
          if (prev.some((a) => a._id?.toString() === data.attachment._id?.toString())) {
            return prev;
          }
          const updated = [data.attachment, ...prev];
          onAttachmentsCountChange?.(updated.length);
          return updated;
        });
        setLinkUrl('');
        setLinkTitle('');
      }
    } catch (err) {
      console.error('Failed to attach link:', err);
      setError(err.response?.data?.message || 'Failed to attach link.');
    } finally {
      setAddingLink(false);
    }
  };

  // Drag & Drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentUserRole !== 'viewer' && !uploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (currentUserRole === 'viewer' || uploading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleUploadFile(files[0]);
    }
  };

  // Download attachment
  const handleDownload = async (attachment) => {
    if (!attachment?._id || downloadingId) return;

    try {
      setDownloadingId(attachment._id);
      const response = await api.get(`/attachments/${attachment._id}/download`, {
        responseType: 'blob',
      });

      // Trigger browser download of blob
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', attachment.filename || 'download');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Failed to download file:', err);
      alert(err.response?.data?.message || 'Failed to download file.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Delete attachment (uploader or owner)
  const handleDelete = async (attachmentId) => {
    if (!attachmentId || deletingId) return;
    if (!window.confirm('Are you sure you want to delete this attachment?')) return;

    try {
      setDeletingId(attachmentId);
      await api.delete(`/attachments/${attachmentId}`);

      setAttachments((prev) => {
        const updated = prev.filter((a) => a._id !== attachmentId);
        onAttachmentsCountChange?.(updated.length);
        return updated;
      });
    } catch (err) {
      console.error('Failed to delete attachment:', err);
      alert(err.response?.data?.message || 'Failed to delete attachment.');
    } finally {
      setDeletingId(null);
    }
  };

  // Check if current user can delete attachment
  const canDeleteAttachment = (attachment) => {
    if (currentUserRole === 'owner') return true;
    const uploaderId = attachment.uploadedBy?._id || attachment.uploadedBy;
    const currentUserId = currentUser?._id || currentUser?.id;
    return Boolean(
      uploaderId && currentUserId && uploaderId.toString() === currentUserId.toString()
    );
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Upload Zone / Add Link - Hidden for viewers */}
      {currentUserRole !== 'viewer' && (
        <div className="space-y-3">
          {/* Mode Switcher */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Add Attachment
            </span>
            <div className="flex rounded-lg border border-input p-0.5 bg-background text-[11px]">
              <button
                type="button"
                onClick={() => setMode('file')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  mode === 'file'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload File</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('link')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  mode === 'link'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Attach Link</span>
              </button>
            </div>
          </div>

          {/* Mode: File Upload */}
          {mode === 'file' ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                isDragging
                  ? 'border-primary bg-primary/10 scale-[1.01]'
                  : uploading
                  ? 'border-border bg-secondary/30 opacity-70 cursor-wait'
                  : 'border-border hover:border-primary/50 hover:bg-secondary/40 bg-secondary/20'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadFile(file);
                }}
                disabled={uploading}
                className="hidden"
              />

              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shadow-xs mb-1">
                {uploading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <UploadCloud className="w-6 h-6" />
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-foreground">
                  {uploading
                    ? `Uploading file... ${uploadProgress}%`
                    : isDragging
                    ? 'Drop file here to upload'
                    : 'Drop or Select files'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  PDFs, docs, images, archives, whatever files up to 10MB each
                </p>
              </div>

              {/* Upload Progress Bar */}
              {uploading && (
                <div className="w-full max-w-xs h-1.5 bg-secondary rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            /* Mode: Link Attachment Form */
            <form
              onSubmit={handleAddLink}
              className="p-4 rounded-2xl bg-secondary/20 border border-border space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="Paste link URL (e.g. Figma, Google Docs, GitHub PR...)"
                    disabled={addingLink}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    placeholder="Title (optional)"
                    disabled={addingLink}
                    className="w-full px-3 py-2 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={addingLink || !linkUrl.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer transition-opacity shadow-xs"
                >
                  {addingLink ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Attaching...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Attach Link</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Attachments List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[360px] pr-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
            <p className="text-xs">Loading attachments...</p>
          </div>
        ) : attachments.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground">
            <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center mb-2 border border-border">
              <Paperclip className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <p className="text-xs font-semibold text-foreground">No attachments yet</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Attach project briefs, PDFs, links, UI designs, or relevant files.
            </p>
          </div>
        ) : (
          attachments.map((attachment) => {
            const isLink = attachment.type === 'link';
            const meta = isLink
              ? {
                  icon: Link2,
                  color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
                  isImage: false,
                }
              : getFileMeta(attachment.filename, attachment.mimeType);
            const IconComponent = meta.icon;
            const canDelete = canDeleteAttachment(attachment);
            const uploader = attachment.uploader || attachment.uploadedBy;
            const uploaderName =
              typeof uploader === 'object' && uploader?.name ? uploader.name : 'User';
            const uploaderAvatar =
              typeof uploader === 'object' && uploader?.avatarUrl
                ? uploader.avatarUrl
                : null;

            return (
              <div
                key={attachment._id}
                className="group flex items-center justify-between gap-3 p-3 rounded-xl bg-background border border-border hover:border-primary/40 transition-colors"
              >
                {/* File/Link Icon & Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${meta.color}`}
                  >
                    <IconComponent className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p
                        className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors"
                        title={attachment.filename}
                      >
                        {attachment.filename}
                      </p>
                      {isLink && (
                        <span className="text-[9px] uppercase tracking-wider px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-500 font-semibold border border-indigo-500/20 shrink-0">
                          Link
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                      {isLink ? (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate max-w-[240px] font-mono text-[10px] inline-flex items-center gap-0.5"
                          title={attachment.url}
                        >
                          <span>{attachment.url}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      ) : (
                        <span className="font-mono font-medium">
                          {formatFileSize(attachment.sizeBytes)}
                        </span>
                      )}
                      <span>•</span>
                      <span>{formatRelativeTime(attachment.createdAt)}</span>
                      <span>•</span>
                      <div className="inline-flex items-center gap-1">
                        {uploaderAvatar ? (
                          <img
                            src={uploaderAvatar}
                            alt={uploaderName}
                            className="w-3.5 h-3.5 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full bg-secondary text-primary font-bold text-[8px] flex items-center justify-center">
                            {uploaderName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span>{uploaderName}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Download or Open Link */}
                  {isLink ? (
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary transition-colors cursor-pointer inline-flex items-center justify-center"
                      title="Open link in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDownload(attachment)}
                      disabled={downloadingId === attachment._id}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer disabled:opacity-50"
                      title="Download file"
                    >
                      {downloadingId === attachment._id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  {/* Delete button (uploader or workspace owner) */}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(attachment._id)}
                      disabled={deletingId === attachment._id}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
                      title="Delete attachment"
                    >
                      {deletingId === attachment._id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-destructive" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
