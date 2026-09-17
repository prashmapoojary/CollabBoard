import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';

import { AssigneePicker } from './AssigneePicker';

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
  const [dueDate, setDueDate] = useState('');
  const [selectedAssignees, setSelectedAssignees] = useState([]);

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

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        order: 0,
        taskType,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        assignees: selectedAssignees,
      };

      const { data } = await api.post(`/lists/${listId}/tasks`, payload);
      const createdTask = data.task;

      // Attach project title and list title for immediate client-side presentation
      const currentProj = projects.find((p) => p._id === projectId);
      const currentList = lists.find((l) => l._id === listId);

      onTaskCreated?.({
        ...createdTask,
        projectName: currentProj?.title || 'Project',
        projectId,
        listName: currentList?.title || 'List',
        listId,
      });

      // Reset form
      setTitle('');
      setDescription('');
      setTaskType('task');
      setDueDate('');
      setSelectedAssignees([]);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create task.');
    } finally {
      setSubmitting(false);
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

          {/* Task Type & Due Date Row */}
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

            {/* Due Date & Time */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Due Date & Time
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                </div>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={submitting}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground cursor-pointer"
                />
              </div>
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
                  Creating...
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
