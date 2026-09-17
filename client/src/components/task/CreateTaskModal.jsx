import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/axios';
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FolderKanban,
  ListTodo,
  AlignLeft,
  Calendar,
  Tag,
  CheckSquare,
  Bug,
  BookOpen,
  Paperclip,
  UploadCloud,
  Link2,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react';

import { AssigneePicker } from './AssigneePicker';
import { formatFileSize, getFileMeta } from './TaskAttachments';

/**
 * Helper to pre-select "To Do" by title (case-insensitive)
 * or fall back to the list with lowest order value.
 */
export const getPreferredListId = (loadedLists = []) => {
  if (!loadedLists || loadedLists.length === 0) return '';
  const todoList = loadedLists.find(
    (l) =>
      l.title?.trim().toLowerCase() === 'to do' ||
      l.title?.trim().toLowerCase() === 'todo'
  );
  if (todoList) return todoList._id;
  const sorted = [...loadedLists].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return sorted[0]._id;
};

export const CreateTaskModal = ({
  isOpen,
  onClose,
  workspaceId,
  projects = [],
  members = [],
  selectedProjectId = null,
  onTaskCreated,
}) => {
  const [projectId, setProjectId] = useState(
    selectedProjectId || (projects.length > 0 ? projects[0]._id : '')
  );
  const [lists, setLists] = useState([]);
  const [listId, setListId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState('task');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [selectedAssignees, setSelectedAssignees] = useState([]);
  const dueDatePickerRef = useRef(null);

  // Attachments State
  const [pendingFiles, setPendingFiles] = useState([]);
  const [pendingLinks, setPendingLinks] = useState([]);
  const [attachmentMode, setAttachmentMode] = useState('file'); // 'file' | 'link'
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [attachmentError, setAttachmentError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef(null);

  const [loadingLists, setLoadingLists] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 1. Sync active projectId whenever modal opens or route/selection changes
  useEffect(() => {
    if (!isOpen) return;

    if (selectedProjectId) {
      setProjectId(selectedProjectId);
    } else if (!projectId && projects.length > 0) {
      setProjectId(projects[0]._id);
    }
  }, [isOpen, selectedProjectId, projects]);

  // 2. Load fresh lists whenever modal is open and projectId is set
  useEffect(() => {
    if (!isOpen) return;

    if (!projectId) {
      setLists([]);
      setListId('');
      return;
    }

    let isMounted = true;

    const fetchProjectLists = async () => {
      try {
        setLoadingLists(true);
        setError('');
        const { data } = await api.get(`/projects/${projectId}`);
        if (!isMounted) return;

        const loadedLists = data.project?.lists || [];
        setLists(loadedLists);

        // Pre-select "To Do" by default, or fallback to lowest order
        const preferredId = getPreferredListId(loadedLists);
        setListId(preferredId);
      } catch (err) {
        if (!isMounted) return;
        setError(err.response?.data?.message || 'Failed to load project lists.');
      } finally {
        if (isMounted) {
          setLoadingLists(false);
        }
      }
    };

    fetchProjectLists();

    return () => {
      isMounted = false;
    };
  }, [isOpen, projectId]);

  // Attachment helper handlers
  const handleAddFiles = (files) => {
    setAttachmentError('');
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    const valid = [];
    for (const f of newFiles) {
      if (f.size > 10 * 1024 * 1024) {
        setAttachmentError(`"${f.name}" exceeds the 10MB size limit.`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length > 0) {
      setPendingFiles((prev) => [...prev, ...valid]);
    }
  };

  const handleRemoveFile = (index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddLink = (e) => {
    e?.preventDefault?.();
    setAttachmentError('');
    if (!linkUrl.trim()) {
      setAttachmentError('Please enter a link URL.');
      return;
    }
    let url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    try {
      new URL(url);
    } catch {
      setAttachmentError('Invalid URL. Please enter a valid web link.');
      return;
    }

    setPendingLinks((prev) => [
      ...prev,
      {
        url,
        title: linkTitle.trim() || url,
      },
    ]);
    setLinkUrl('');
    setLinkTitle('');
  };

  const handleRemoveLink = (index) => {
    setPendingLinks((prev) => prev.filter((_, i) => i !== index));
  };

  // Drag & drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!submitting) setIsDragging(true);
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
    if (submitting) return;
    if (e.dataTransfer?.files?.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId) {
      setError('Please select a project.');
      return;
    }
    if (!listId) {
      setError('Please select a list. Ensure the chosen project has at least one list.');
      return;
    }
    if (!title.trim()) {
      setError('Task title cannot be empty.');
      return;
    }

    setSubmitting(true);
    setError('');
    setUploadStatus('Creating task...');

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        order: 0,
        taskType,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        assignees: selectedAssignees,
      };

      const { data } = await api.post(`/lists/${listId}/tasks`, payload);
      const createdTask = data.task;

      let attachedCount = 0;
      const failedUploads = [];

      // 1. Upload files sequentially
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        setUploadStatus(`Uploading file ${i + 1} of ${pendingFiles.length}...`);
        const formData = new FormData();
        formData.append('file', file);
        try {
          await api.post(`/tasks/${createdTask._id}/attachments`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          attachedCount++;
        } catch (uploadErr) {
          console.error('Failed to upload file attachment:', uploadErr);
          failedUploads.push(file.name);
        }
      }

      // 2. Add links sequentially
      for (let i = 0; i < pendingLinks.length; i++) {
        const link = pendingLinks[i];
        setUploadStatus(`Adding link ${i + 1} of ${pendingLinks.length}...`);
        try {
          await api.post(`/tasks/${createdTask._id}/attachments/link`, {
            url: link.url,
            title: link.title,
          });
          attachedCount++;
        } catch (linkErr) {
          console.error('Failed to attach link:', linkErr);
          failedUploads.push(link.title || link.url);
        }
      }

      // Attach project title and list title for immediate client-side presentation
      const currentProj = projects.find((p) => p._id === projectId);
      const currentList = lists.find((l) => l._id === listId);

      onTaskCreated?.({
        ...createdTask,
        projectName: currentProj?.title || 'Project',
        projectId,
        listName: currentList?.title || 'List',
        listId,
        attachmentCount: attachedCount,
        attachmentsCount: attachedCount,
      });

      // Reset form
      setTitle('');
      setDescription('');
      setTaskType('task');
      setPriority('medium');
      setDueDate('');
      setSelectedAssignees([]);
      setPendingFiles([]);
      setPendingLinks([]);
      setLinkUrl('');
      setLinkTitle('');
      setAttachmentError('');
      setUploadStatus('');
      onClose();

      if (failedUploads.length > 0) {
        alert(
          `Task "${createdTask.title}" was created successfully, but ${failedUploads.length} attachment(s) failed to upload:\n• ${failedUploads.join('\n• ')}`
        );
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create task.');
    } finally {
      setSubmitting(false);
      setUploadStatus('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-card-foreground animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-secondary/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold font-serif text-foreground">Create Task</h3>
              <p className="text-xs text-muted-foreground">Add a new item to a project board</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Project Dropdown */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Project <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                <FolderKanban className="w-4 h-4" />
              </div>
              <select
                id="create-task-project-select"
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={submitting || (Boolean(selectedProjectId) && projects.length > 0)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground cursor-pointer disabled:opacity-75"
              >
                <option value="">Select a project...</option>
                {projects.map((proj) => (
                  <option key={proj._id} value={proj._id}>
                    {proj.title}
                  </option>
                ))}
              </select>
            </div>
            {projects.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                No projects found in this workspace. Please create a project first.
              </p>
            )}
          </div>

          {/* List Dropdown */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              List <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                <ListTodo className="w-4 h-4" />
              </div>
              <select
                id="create-task-list-select"
                required
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                disabled={!projectId || loadingLists || lists.length === 0 || submitting}
                className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground cursor-pointer disabled:opacity-60"
              >
                {!projectId && <option value="">Select a project first...</option>}
                {projectId && loadingLists && <option value="">Loading lists...</option>}
                {projectId && !loadingLists && lists.length === 0 && (
                  <option value="">No lists in this project</option>
                )}
                {lists.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Task Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Task Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement user profile page"
              maxLength={255}
              disabled={submitting}
              autoFocus
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Type & Priority Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Task Type */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Type
              </label>
              <div className="flex rounded-xl border border-input p-1 bg-background">
                {[
                  { id: 'task', label: 'Task', icon: CheckSquare },
                  { id: 'bug', label: 'Bug', icon: Bug },
                  { id: 'story', label: 'Story', icon: BookOpen },
                ].map((type) => {
                  const Icon = type.icon;
                  const active = taskType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setTaskType(type.id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        active
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Priority Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Priority
              </label>
              <div className="flex rounded-xl border border-input p-1 bg-background gap-0.5">
                {[
                  { id: 'low', label: 'Low', activeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
                  { id: 'medium', label: 'Med', activeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
                  { id: 'high', label: 'High', activeClass: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30' },
                  { id: 'urgent', label: 'Urgent', activeClass: 'bg-destructive/15 text-destructive border-destructive/30' },
                ].map((p) => {
                  const active = priority === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPriority(p.id)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
                        active
                          ? `${p.activeClass} border shadow-2xs font-bold`
                          : 'text-muted-foreground hover:text-foreground border border-transparent'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Due Date & Time */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Due Date & Time
            </label>
            <div
              className="relative cursor-pointer"
              onClick={() => {
                try {
                  dueDatePickerRef.current?.showPicker?.();
                } catch (err) {
                  dueDatePickerRef.current?.focus?.();
                }
              }}
            >
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                <Calendar className="w-4 h-4" />
              </div>
              <input
                ref={dueDatePickerRef}
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch (err) {}
                }}
                disabled={submitting}
                className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground cursor-pointer"
              />
            </div>
          </div>

          {/* Assignees Picker */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Assignees
            </label>
            <AssigneePicker
              members={members}
              selectedUserIds={selectedAssignees}
              onChange={setSelectedAssignees}
              disabled={submitting}
              placeholder="Select team members to assign..."
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details, acceptance criteria, notes..."
              rows={3}
              maxLength={5000}
              disabled={submitting}
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground resize-none"
            />
          </div>

          {/* Attachments Section */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-primary" />
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Attachments
                </label>
                {pendingFiles.length + pendingLinks.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-primary/15 text-primary font-bold">
                    {pendingFiles.length + pendingLinks.length}
                  </span>
                )}
              </div>

              {/* Mode switch */}
              <div className="flex rounded-lg border border-input p-0.5 bg-background text-[11px]">
                <button
                  type="button"
                  onClick={() => setAttachmentMode('file')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 ${
                    attachmentMode === 'file'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <UploadCloud className="w-3 h-3" />
                  <span>Files</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAttachmentMode('link')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 ${
                    attachmentMode === 'link'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Link2 className="w-3 h-3" />
                  <span>Link</span>
                </button>
              </div>
            </div>

            {/* Error banner if any */}
            {attachmentError && (
              <div className="p-2 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-[11px] flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{attachmentError}</span>
              </div>
            )}

            {/* Mode: File Upload Zone */}
            {attachmentMode === 'file' ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !submitting && fileInputRef.current?.click()}
                className={`border border-dashed rounded-xl p-3.5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 ${
                  isDragging
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-secondary/20 hover:border-primary/50 hover:bg-secondary/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) handleAddFiles(e.target.files);
                  }}
                  disabled={submitting}
                  className="hidden"
                />
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-foreground">
                  {isDragging ? 'Drop files here' : 'Drop or browse files'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  PDFs, docs, images, archives, whatever files up to 10MB each
                </p>
              </div>
            ) : (
              /* Mode: Add Link */
              <div className="space-y-2 p-3 rounded-xl bg-secondary/20 border border-border">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-muted-foreground">
                      <Link2 className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="Paste link URL (e.g. https://figma.com/...)"
                      disabled={submitting}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddLink(e);
                        }
                      }}
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                    />
                  </div>
                  <input
                    type="text"
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    placeholder="Title (optional)"
                    disabled={submitting}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLink(e);
                      }
                    }}
                    className="w-32 px-2.5 py-1.5 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                  />
                  <button
                    type="button"
                    onClick={handleAddLink}
                    disabled={submitting || !linkUrl.trim()}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer shrink-0 transition-opacity flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            )}

            {/* List of Pending Attachments */}
            {pendingFiles.length > 0 || pendingLinks.length > 0 ? (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 pt-1">
                {/* Pending Files */}
                {pendingFiles.map((file, idx) => {
                  const meta = getFileMeta(file.name, file.type);
                  const Icon = meta.icon;
                  return (
                    <div
                      key={`file-${idx}`}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div
                          className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${meta.color}`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span
                          className="truncate font-medium text-foreground text-xs"
                          title={file.name}
                        >
                          {file.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(idx)}
                        disabled={submitting}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer transition-colors"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

                {/* Pending Links */}
                {pendingLinks.map((link, idx) => (
                  <div
                    key={`link-${idx}`}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 border text-indigo-500 bg-indigo-500/10 border-indigo-500/20">
                        <Link2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span
                          className="truncate block font-medium text-foreground text-xs"
                          title={link.title}
                        >
                          {link.title}
                        </span>
                        <span
                          className="truncate block text-[10px] text-muted-foreground"
                          title={link.url}
                        >
                          {link.url}
                        </span>
                      </div>
                      <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                        Link
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveLink(idx)}
                      disabled={submitting}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer transition-colors"
                      title="Remove link"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground border border-border cursor-pointer transition-colors"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !projectId || !listId || !title.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 cursor-pointer disabled:opacity-60 shadow-xs transition-opacity"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {uploadStatus || 'Creating...'}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Create Task
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
