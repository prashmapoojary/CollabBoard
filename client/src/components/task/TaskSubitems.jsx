import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/axios';
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  ListTodo,
} from 'lucide-react';

export const TaskSubitems = ({
  taskId,
  currentUserRole = 'viewer',
  onSubitemsProgressChange,
}) => {
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();
  const { toast } = useToast();

  const [subitems, setSubitems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [newSubitemText, setNewSubitemText] = useState('');

  // Calculate progress
  const progress = useMemo(() => {
    const total = subitems.length;
    const completed = subitems.filter((s) => s.completed).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percentage };
  }, [subitems]);

  // Notify parent of progress
  useEffect(() => {
    onSubitemsProgressChange?.({
      total: progress.total,
      completed: progress.completed,
    });
  }, [progress, onSubitemsProgressChange]);

  // Fetch subitems for the task
  const fetchSubitems = useCallback(async () => {
    if (!taskId) return;

    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`/tasks/${taskId}/subitems`);
      const list = data.subitems || [];
      setSubitems(list);
    } catch (err) {
      console.error('Failed to load subitems:', err);
      setError(err.response?.data?.message || 'Failed to load subitems.');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchSubitems();
  }, [fetchSubitems]);

  // Real-time socket updates filtered by taskId
  useEffect(() => {
    if (!socket || !taskId) return;

    const handleRemoteSubitemCreated = (data) => {
      if (data?.taskId?.toString() === taskId?.toString() && data.subitem) {
        setSubitems((prev) => {
          if (prev.some((s) => s._id?.toString() === data.subitem._id?.toString())) {
            return prev;
          }
          return [...prev, data.subitem];
        });
      }
    };

    const handleRemoteSubitemUpdated = (data) => {
      if (data?.taskId?.toString() === taskId?.toString() && data.subitem) {
        setSubitems((prev) =>
          prev.map((s) =>
            s._id?.toString() === data.subitem._id?.toString() ? data.subitem : s
          )
        );
      }
    };

    const handleRemoteSubitemDeleted = (data) => {
      if (data?.taskId?.toString() === taskId?.toString() && data.subitemId) {
        setSubitems((prev) =>
          prev.filter((s) => s._id?.toString() !== data.subitemId.toString())
        );
      }
    };

    socket.on('subitem:created', handleRemoteSubitemCreated);
    socket.on('subitem:updated', handleRemoteSubitemUpdated);
    socket.on('subitem:deleted', handleRemoteSubitemDeleted);

    return () => {
      socket.off('subitem:created', handleRemoteSubitemCreated);
      socket.off('subitem:updated', handleRemoteSubitemUpdated);
      socket.off('subitem:deleted', handleRemoteSubitemDeleted);
    };
  }, [socket, taskId]);

  // Add new subitem
  const handleAddSubitem = async (e) => {
    e?.preventDefault();
    const trimmed = newSubitemText.trim();
    if (!trimmed || creating || currentUserRole === 'viewer') return;

    try {
      setCreating(true);
      setError('');

      const { data } = await api.post(`/tasks/${taskId}/subitems`, {
        text: trimmed,
      });

      if (data?.subitem) {
        setSubitems((prev) => {
          if (prev.some((s) => s._id?.toString() === data.subitem._id?.toString())) {
            return prev;
          }
          return [...prev, data.subitem];
        });
        setNewSubitemText('');
      }
    } catch (err) {
      console.error('Failed to add subitem:', err);
      setError(err.response?.data?.message || 'Failed to add checklist item.');
    } finally {
      setCreating(false);
    }
  };

  // Optimistic toggle of completed state with rollback on failure
  const handleToggle = async (subitem) => {
    if (currentUserRole === 'viewer') return;

    const previousCompleted = subitem.completed;
    const targetCompleted = !previousCompleted;

    // 1. Optimistic UI update
    setSubitems((prev) =>
      prev.map((s) =>
        s._id === subitem._id ? { ...s, completed: targetCompleted } : s
      )
    );

    // 2. Network call
    try {
      const { data } = await api.patch(`/tasks/${taskId}/subitems/${subitem._id}`, {
        completed: targetCompleted,
      });

      if (data?.subitem) {
        setSubitems((prev) =>
          prev.map((s) => (s._id === subitem._id ? data.subitem : s))
        );
      }
    } catch (err) {
      console.error('Failed to toggle subitem:', err);
      // Rollback to previous state
      setSubitems((prev) =>
        prev.map((s) =>
          s._id === subitem._id ? { ...s, completed: previousCompleted } : s
        )
      );
      setError(err.response?.data?.message || 'Failed to update checklist item.');
    }
  };

  // Delete subitem (creator of the subitem or workspace owner only)
  const handleDelete = async (subitemId) => {
    if (!subitemId || deletingId) return;
    if (!window.confirm('Are you sure you want to delete this checklist item?')) return;

    try {
      setDeletingId(subitemId);
      await api.delete(`/tasks/${taskId}/subitems/${subitemId}`);

      setSubitems((prev) => prev.filter((s) => s._id !== subitemId));
    } catch (err) {
      console.error('Failed to delete subitem:', err);
      toast.error(err.response?.data?.message || 'Failed to delete checklist item.');
    } finally {
      setDeletingId(null);
    }
  };

  // Check if current user can delete a specific subitem
  const canDeleteSubitem = (subitem) => {
    if (currentUserRole === 'owner') return true;
    const creatorId = subitem.createdBy?._id || subitem.createdBy;
    const currentUserId = currentUser?._id || currentUser?.id;
    return Boolean(
      creatorId && currentUserId && creatorId.toString() === currentUserId.toString()
    );
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Progress header */}
      <div className="p-3.5 bg-secondary/40 border border-border rounded-xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <CheckSquare className="w-4 h-4 text-primary" />
            <span>Checklist Progress</span>
          </span>
          <span className="font-mono text-muted-foreground font-medium">
            {progress.completed} of {progress.total} completed ({progress.percentage}%)
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden border border-border/40">
          <div
            className={`h-full transition-all duration-300 rounded-full ${
              progress.percentage === 100 ? 'bg-emerald-500' : 'bg-primary'
            }`}
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Checklist items list */}
      <div className="flex-1 overflow-y-auto space-y-2 max-h-[360px] pr-1">
        {loading ? (
          <div className="space-y-2 pt-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/50 bg-secondary/15 animate-pulse"
              >
                <div className="flex items-center gap-2.5 flex-1">
                  <div className="w-4 h-4 rounded bg-muted/70 shrink-0" />
                  <div className="h-3.5 bg-muted/60 rounded w-2/3" />
                </div>
                <div className="h-3 bg-muted/40 rounded w-16" />
              </div>
            ))}
          </div>
        ) : subitems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground">
            <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center mb-2 border border-border">
              <ListTodo className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <p className="text-xs font-semibold text-foreground">No subtasks yet</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Break down this task into smaller manageable checklist items.
            </p>
          </div>
        ) : (
          subitems.map((subitem) => {
            const canDelete = canDeleteSubitem(subitem);
            const creator = subitem.creator || subitem.createdBy;
            const creatorName =
              typeof creator === 'object' && creator?.name ? creator.name : null;

            return (
              <div
                key={subitem._id}
                className={`group flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                  subitem.completed
                    ? 'bg-secondary/20 border-border/40 text-muted-foreground'
                    : 'bg-background border-border text-foreground hover:border-primary/40'
                }`}
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleToggle(subitem)}
                    disabled={currentUserRole === 'viewer'}
                    className={`cursor-pointer transition-colors p-0.5 rounded ${
                      currentUserRole === 'viewer' ? 'cursor-default opacity-70' : ''
                    } ${
                      subitem.completed
                        ? 'text-emerald-500 hover:text-emerald-600'
                        : 'text-muted-foreground hover:text-primary'
                    }`}
                    title={
                      currentUserRole === 'viewer'
                        ? 'View only'
                        : subitem.completed
                        ? 'Mark as incomplete'
                        : 'Mark as completed'
                    }
                  >
                    {subitem.completed ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  <span
                    className={`text-xs break-words leading-relaxed select-none ${
                      subitem.completed ? 'line-through opacity-60' : 'font-medium'
                    }`}
                  >
                    {subitem.text}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {creatorName && (
                    <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
                      added by {creatorName}
                    </span>
                  )}

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(subitem._id)}
                      disabled={deletingId === subitem._id}
                      className="text-muted-foreground hover:text-destructive p-1 rounded-md transition-colors cursor-pointer opacity-0 group-hover:opacity-100 disabled:opacity-50"
                      title="Delete subitem"
                    >
                      {deletingId === subitem._id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Subitem Input Form (hidden for viewers) */}
      {currentUserRole !== 'viewer' && (
        <form onSubmit={handleAddSubitem} className="flex items-center gap-2 pt-2 border-t border-border">
          <input
            type="text"
            value={newSubitemText}
            onChange={(e) => setNewSubitemText(e.target.value)}
            placeholder="Add a checklist subtask..."
            maxLength={300}
            disabled={creating}
            className="flex-1 px-3 py-2 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={creating || !newSubitemText.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shadow-xs shrink-0"
          >
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>Add</span>
          </button>
        </form>
      )}
    </div>
  );
};
