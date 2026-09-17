import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/axios';
import {
  X,
  Calendar,
  Tag,
  User,
  CheckSquare,
  Bug,
  BookOpen,
  FolderKanban,
  ListTodo,
  Clock,
  Edit3,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  ShieldAlert,
  MessageSquare,
  Paperclip,
} from 'lucide-react';
import { TaskComments } from './TaskComments';
import { TaskSubitems } from './TaskSubitems';
import { TaskAttachments } from './TaskAttachments';
import { AssigneePicker } from './AssigneePicker';
import { toDateTimeLocalValue, formatDueDate } from '../../utils/dateUtils';

export const TaskDetailModal = ({
  task,
  isOpen,
  onClose,
  currentUserRole = 'viewer',
  members = [],
  membersMap = null,
  onTaskUpdated,
  onTaskDeleted,
}) => {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'subitems' | 'attachments' | 'comments'
  const [commentsCount, setCommentsCount] = useState(0);
  const [subitemsProgress, setSubitemsProgress] = useState({ total: 0, completed: 0 });
  const [attachmentsCount, setAttachmentsCount] = useState(0);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTaskType, setEditTaskType] = useState('task');
  const [editDueDate, setEditDueDate] = useState('');
  const [editAssignees, setEditAssignees] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (task) {
      setEditTitle(task.title || '');
      setEditDescription(task.description || '');
      setEditTaskType(task.taskType || 'task');
      setEditDueDate(toDateTimeLocalValue(task.dueDate));
      setSubitemsProgress(task.subitemProgress || { total: 0, completed: 0 });
      const initialAssigneeIds = (task.assignees || [])
        .map((a) =>
          (typeof a === 'object' && a !== null ? a._id || a.id : a)?.toString()
        )
        .filter(Boolean);
      setEditAssignees(initialAssigneeIds);
      setIsEditing(false);
      setError('');
      setActiveTab('details');
    }
  }, [task, isOpen]);

  if (!isOpen || !task) return null;

  // Step 4 Ownership Permission Computation:
  const isWorkspaceOwner = currentUserRole === 'owner';
  const taskCreatorId = task.createdBy?._id || task.createdBy;
  const isCreator =
    user?._id && taskCreatorId && taskCreatorId.toString() === user._id.toString();
  const isAssignee = task.assignees?.some(
    (a) => (a?._id || a)?.toString() === user?._id?.toString()
  );

  const canEdit =
    currentUserRole !== 'viewer' && (isWorkspaceOwner || isCreator || isAssignee);
  const canDelete =
    currentUserRole !== 'viewer' && (isWorkspaceOwner || isCreator);

  const typeConfig = {
    bug: {
      label: 'Bug',
      icon: Bug,
      color: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20',
    },
    story: {
      label: 'Story',
      icon: BookOpen,
      color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    task: {
      label: 'Task',
      icon: CheckSquare,
      color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
    },
  };

  const currentType = typeConfig[task.taskType] || typeConfig.task;
  const TypeIcon = currentType.icon;

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

  // Save changes via PATCH /api/tasks/:id
  const handleSave = async (e) => {
    e?.preventDefault();
    if (!editTitle.trim()) {
      setError('Task title cannot be empty.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        title: editTitle.trim(),
        description: editDescription.trim(),
        taskType: editTaskType,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
        assignees: editAssignees,
      };

      const { data } = await api.patch(`/tasks/${task._id}`, payload);

      // Resolve populated assignee objects using membersMap or members list
      const resolvedAssignees = editAssignees.map((id) => {
        const idStr = id?.toString();
        const found = membersMap?.get?.(idStr);
        if (found) return found;
        const m = (members || []).find((mem) => {
          const u = mem.userId || mem;
          return (u._id || u.id || mem._id || mem.id)?.toString() === idStr;
        });
        return m?.userId || m || { _id: id, name: 'Team Member' };
      });

      const updated = {
        ...task,
        ...data.task,
        assignees: resolvedAssignees,
      };
      onTaskUpdated?.(updated);
      setIsEditing(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update task.');
    } finally {
      setSaving(false);
    }
  };

  // Delete task via DELETE /api/tasks/:id
  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete task "${task.title}"?`)) {
      return;
    }

    setDeleting(true);
    setError('');

    try {
      await api.delete(`/tasks/${task._id}`);
      onTaskDeleted?.(task._id);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete task.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-card-foreground animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Breadcrumbs & Actions */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-secondary/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <FolderKanban className="w-3.5 h-3.5 text-primary" />
              {task.projectName || 'Project'}
            </span>
            <span>/</span>
            <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
              <ListTodo className="w-3.5 h-3.5" />
              {task.listName || 'List'}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs (Details vs Subitems vs Attachments vs Comments) */}
        <div className="px-6 border-b border-border flex items-center gap-1 bg-secondary/15 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'details'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Details</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('subitems')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'subitems'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            <span>Subitems</span>
            {subitemsProgress.total > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-primary/15 text-primary font-bold">
                {subitemsProgress.completed}/{subitemsProgress.total}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('attachments')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'attachments'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span>Attachments</span>
            {attachmentsCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-primary/15 text-primary font-bold">
                {attachmentsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('comments')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'comments'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Comments</span>
            {commentsCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-primary/15 text-primary font-bold">
                {commentsCount}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'subitems' ? (
          <div className="flex-1 overflow-y-auto p-6">
            <TaskSubitems
              taskId={task._id}
              currentUserRole={currentUserRole}
              onSubitemsProgressChange={setSubitemsProgress}
            />
          </div>
        ) : activeTab === 'attachments' ? (
          <div className="flex-1 overflow-y-auto p-6">
            <TaskAttachments
              taskId={task._id}
              currentUserRole={currentUserRole}
              onAttachmentsCountChange={setAttachmentsCount}
            />
          </div>
        ) : activeTab === 'comments' ? (
          <div className="flex-1 overflow-y-auto p-6">
            <TaskComments
              taskId={task._id}
              currentUserRole={currentUserRole}
              onCommentsCountChange={setCommentsCount}
            />
          </div>
        ) : (
          /* Content Body: Task Details */
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {error && (
              <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

          {isEditing ? (
            /* EDIT MODE FORM */
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Task Title <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground font-semibold"
                  autoFocus
                  disabled={saving}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Task Type */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Type
                  </label>
                  <select
                    value={editTaskType}
                    onChange={(e) => setEditTaskType(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground cursor-pointer"
                    disabled={saving}
                  >
                    <option value="task">Task</option>
                    <option value="bug">Bug</option>
                    <option value="story">Story</option>
                  </select>
                </div>

                {/* Due Date & Time */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Due Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground cursor-pointer"
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Assignees */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Assignees
                </label>
                <AssigneePicker
                  members={members}
                  selectedUserIds={editAssignees}
                  onChange={setEditAssignees}
                  disabled={saving}
                  placeholder="Select assignees..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground resize-none placeholder:text-muted-foreground"
                  placeholder="Task details..."
                  disabled={saving}
                />
              </div>
            </form>
          ) : (
            /* VIEW MODE */
            <>
              {/* Title & Type Badge */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${currentType.color}`}
                  >
                    <TypeIcon className="w-3.5 h-3.5" />
                    {currentType.label}
                  </span>
                  {task._id && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      #{task._id.slice(-6).toUpperCase()}
                    </span>
                  )}
                  {isCreator && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                      Created by you
                    </span>
                  )}
                  {!isCreator && isAssignee && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium border border-blue-500/20">
                      Assigned to you
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold font-serif text-foreground leading-snug">
                  {task.title}
                </h2>
              </div>

              {/* Properties Grid */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-secondary/30 border border-border">
                {/* List Column */}
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                    Status / List
                  </span>
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary text-xs font-medium text-foreground">
                    <ListTodo className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{task.listName || 'List Column'}</span>
                  </div>
                </div>

                {/* Due Date & Time */}
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                    Due Date
                  </span>
                  {task.dueDate ? (
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        isOverdue ? 'text-destructive font-semibold' : 'text-foreground'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDueDate(task.dueDate)}
                      {isOverdue && <span className="text-[10px]">(Overdue)</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No due date</span>
                  )}
                </div>

                {/* Assignees */}
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                    Assignees
                  </span>
                  {task.assignees && task.assignees.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {task.assignees.map((assignee) => {
                        const isObj = typeof assignee === 'object' && assignee !== null;
                        const idStr = (isObj ? assignee._id || assignee.id : assignee)?.toString();
                        const resolvedUser = isObj
                          ? assignee
                          : membersMap?.get?.(idStr) ||
                            (members || []).find((m) => {
                              const u = m.userId || m;
                              return (u._id || u.id || m._id || m.id)?.toString() === idStr;
                            })?.userId;
                        const name = resolvedUser?.name || (isObj ? assignee.name : 'Team Member');
                        const avatar = resolvedUser?.avatarUrl || (isObj ? assignee.avatarUrl : null);
                        const key = idStr || (isObj ? assignee._id : assignee);
                        return (
                          <div
                            key={key}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary text-xs text-foreground"
                          >
                            {avatar ? (
                              <img
                                src={avatar}
                                alt={name}
                                className="w-4 h-4 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
                                {name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="font-medium">{name}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Unassigned</span>
                  )}
                </div>

                {/* Labels */}
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                    Labels
                  </span>
                  {task.labels && task.labels.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {task.labels.map((label, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border"
                          style={{
                            backgroundColor: `${label.color}15`,
                            borderColor: `${label.color}40`,
                            color: label.color,
                          }}
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {label.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No labels</span>
                  )}
                </div>
              </div>

              {/* Description Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Description
                </h4>
                <div className="p-4 rounded-xl bg-background border border-border min-h-[80px]">
                  {task.description ? (
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {task.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No description provided for this task.
                    </p>
                  )}
                </div>
              </div>

              {/* Timestamps */}
              {task.createdAt && (
                <div className="pt-2 text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Created {new Date(task.createdAt).toLocaleString()}</span>
                </div>
              )}
            </>
          )}
        </div>
        )}

        {/* Footer Actions (Edit / Delete / Close) */}
        {activeTab === 'details' ? (
          <div className="px-6 py-3 border-t border-border bg-secondary/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Delete button: Creator or Workspace Owner only */}
              {canDelete && !isEditing && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-destructive hover:bg-destructive/10 border border-destructive/20 cursor-pointer transition-colors disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>Delete Task</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    disabled={saving}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground border border-border cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !editTitle.trim()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 cursor-pointer transition-opacity shadow-xs disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Save Changes</span>
                  </button>
                </>
              ) : (
                <>
                  {/* Edit button: Creator, Assignee, or Workspace Owner */}
                  {canEdit && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-secondary text-foreground hover:bg-muted border border-border cursor-pointer transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-primary" />
                      <span>Edit</span>
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 rounded-xl text-xs font-medium bg-secondary text-foreground hover:bg-muted cursor-pointer transition-colors border border-border"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="px-6 py-2.5 border-t border-border bg-secondary/10 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl text-xs font-medium bg-secondary text-foreground hover:bg-muted cursor-pointer transition-colors border border-border"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
