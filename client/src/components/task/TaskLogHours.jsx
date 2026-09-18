import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/axios';
import {
  Clock,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  AlertCircle,
  Calendar,
  FileText,
  User,
} from 'lucide-react';

export const TaskLogHours = ({
  taskId,
  currentUserRole = 'viewer',
  onTotalHoursChange,
}) => {
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();
  const { toast } = useToast();

  const [logHours, setLogHours] = useState([]);
  const [totalHours, setTotalHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Log Form State
  const getTodayDateString = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(getTodayDateString());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dateInputRef = useRef(null);

  // Inline Edit State
  const [editingId, setEditingId] = useState(null);
  const [editHours, setEditHours] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const editDateInputRef = useRef(null);

  // Helper to calculate total
  const computeTotal = (list = []) => {
    const sum = list.reduce((acc, entry) => acc + (Number(entry.hours) || 0), 0);
    return Math.round(sum * 100) / 100;
  };

  // Fetch logged hours
  const fetchLogHours = useCallback(async () => {
    if (!taskId) return;

    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`/tasks/${taskId}/loghours`);
      const list = data.logHours || [];
      const total = data.totalHours ?? computeTotal(list);
      setLogHours(list);
      setTotalHours(total);
      onTotalHoursChange?.(total);
    } catch (err) {
      console.error('Failed to load logged hours:', err);
      setError(err.response?.data?.message || 'Failed to load logged hours.');
    } finally {
      setLoading(false);
    }
  }, [taskId, onTotalHoursChange]);

  useEffect(() => {
    fetchLogHours();
  }, [fetchLogHours]);

  // Real-time Socket.io listeners
  useEffect(() => {
    if (!socket || !taskId) return;

    const handleRemoteLogCreated = (data) => {
      if (data?.taskId?.toString() === taskId?.toString() && data.logHour) {
        setLogHours((prev) => {
          if (prev.some((item) => item._id?.toString() === data.logHour._id?.toString())) {
            return prev;
          }
          const updated = [data.logHour, ...prev].sort(
            (a, b) => new Date(b.date) - new Date(a.date)
          );
          const newTotal = computeTotal(updated);
          setTotalHours(newTotal);
          onTotalHoursChange?.(newTotal);
          return updated;
        });
      }
    };

    const handleRemoteLogUpdated = (data) => {
      if (data?.taskId?.toString() === taskId?.toString() && data.logHour) {
        setLogHours((prev) => {
          const updated = prev
            .map((item) =>
              item._id?.toString() === data.logHour._id?.toString() ? data.logHour : item
            )
            .sort((a, b) => new Date(b.date) - new Date(a.date));
          const newTotal = computeTotal(updated);
          setTotalHours(newTotal);
          onTotalHoursChange?.(newTotal);
          return updated;
        });
      }
    };

    const handleRemoteLogDeleted = (data) => {
      if (data?.taskId?.toString() === taskId?.toString() && data.logHourId) {
        setLogHours((prev) => {
          const updated = prev.filter(
            (item) => item._id?.toString() !== data.logHourId.toString()
          );
          const newTotal = computeTotal(updated);
          setTotalHours(newTotal);
          onTotalHoursChange?.(newTotal);
          return updated;
        });
      }
    };

    socket.on('loghour:created', handleRemoteLogCreated);
    socket.on('loghour:updated', handleRemoteLogUpdated);
    socket.on('loghour:deleted', handleRemoteLogDeleted);

    return () => {
      socket.off('loghour:created', handleRemoteLogCreated);
      socket.off('loghour:updated', handleRemoteLogUpdated);
      socket.off('loghour:deleted', handleRemoteLogDeleted);
    };
  }, [socket, taskId, onTotalHoursChange]);

  // Submit new time log
  const handleLogTime = async (e) => {
    e.preventDefault();
    const numHours = parseFloat(hours);

    if (isNaN(numHours) || numHours < 0.25 || numHours > 24) {
      setError('Please enter a valid duration between 0.25 and 24 hours.');
      return;
    }
    if (!date) {
      setError('Please select a date.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { data } = await api.post(`/tasks/${taskId}/loghours`, {
        hours: numHours,
        date: new Date(date).toISOString(),
        note: note.trim(),
      });

      const updated = [data.logHour, ...logHours].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );
      const newTotal = computeTotal(updated);
      setLogHours(updated);
      setTotalHours(newTotal);
      onTotalHoursChange?.(newTotal);

      // Reset form
      setHours('');
      setDate(getTodayDateString());
      setNote('');
    } catch (err) {
      console.error('Failed to log hours:', err);
      setError(err.response?.data?.message || 'Failed to log hours.');
    } finally {
      setSubmitting(false);
    }
  };

  // Start editing an entry
  const startEdit = (entry) => {
    setEditingId(entry._id);
    setEditHours(entry.hours);
    setEditDate(
      entry.date ? new Date(entry.date).toISOString().split('T')[0] : getTodayDateString()
    );
    setEditNote(entry.note || '');
    setError('');
  };

  // Cancel inline edit
  const cancelEdit = () => {
    setEditingId(null);
    setEditHours('');
    setEditDate('');
    setEditNote('');
  };

  // Save inline edit
  const handleSaveEdit = async (logId) => {
    const numHours = parseFloat(editHours);
    if (isNaN(numHours) || numHours < 0.25 || numHours > 24) {
      setError('Hours must be between 0.25 and 24.');
      return;
    }
    if (!editDate) {
      setError('Date is required.');
      return;
    }

    setUpdating(true);
    setError('');

    try {
      const { data } = await api.patch(`/tasks/${taskId}/loghours/${logId}`, {
        hours: numHours,
        date: new Date(editDate).toISOString(),
        note: editNote.trim(),
      });

      const updated = logHours
        .map((item) => (item._id === logId ? data.logHour : item))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      const newTotal = computeTotal(updated);
      setLogHours(updated);
      setTotalHours(newTotal);
      onTotalHoursChange?.(newTotal);

      cancelEdit();
    } catch (err) {
      console.error('Failed to update logged hours:', err);
      setError(err.response?.data?.message || 'Failed to update logged hours.');
    } finally {
      setUpdating(false);
    }
  };

  // Delete an entry
  const handleDeleteLog = async (logId) => {
    if (!window.confirm('Are you sure you want to delete this time entry?')) {
      return;
    }

    setDeletingId(logId);
    setError('');

    try {
      await api.delete(`/tasks/${taskId}/loghours/${logId}`);

      const updated = logHours.filter((item) => item._id !== logId);
      const newTotal = computeTotal(updated);
      setLogHours(updated);
      setTotalHours(newTotal);
      onTotalHoursChange?.(newTotal);
    } catch (err) {
      console.error('Failed to delete logged hours:', err);
      const msg = err.response?.data?.message || 'Failed to delete logged hours.';
      setError(msg);
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  const isViewer = currentUserRole === 'viewer';
  const isWorkspaceOwner = currentUserRole === 'owner';

  return (
    <div className="space-y-5">
      {/* Prominent Running Total Header Card */}
      <div className="p-4 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
              Total Time Tracked
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-serif text-foreground">
                {totalHours}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                {totalHours === 1 ? 'hour' : 'hours'} logged
              </span>
            </div>
          </div>
        </div>

        <div className="text-right text-xs text-muted-foreground hidden sm:block">
          <span>{logHours.length} {logHours.length === 1 ? 'entry' : 'entries'}</span>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Log Time Form (hidden for viewers) */}
      {!isViewer && (
        <form
          onSubmit={handleLogTime}
          className="p-4 rounded-2xl bg-secondary/20 border border-border space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-primary" />
              Log Time
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Hours input */}
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Hours <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  placeholder="e.g. 2.5"
                  required
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  disabled={submitting}
                  className="w-full px-3 py-1.5 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                />
                <span className="absolute right-3 top-2 text-[11px] text-muted-foreground font-mono">
                  hrs
                </span>
              </div>
            </div>

            {/* Date input with showPicker fix */}
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Date Work Done <span className="text-destructive">*</span>
              </label>
              <div
                className="relative cursor-pointer"
                onClick={() => {
                  try {
                    dateInputRef.current?.showPicker?.();
                  } catch (err) {
                    dateInputRef.current?.focus?.();
                  }
                }}
              >
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <input
                  ref={dateInputRef}
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch (err) {}
                  }}
                  disabled={submitting}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
              Note (optional)
            </label>
            <input
              type="text"
              placeholder="What did you work on?"
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-1.5 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting || !hours || !date}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-xs cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>Log Hours</span>
            </button>
          </div>
        </form>
      )}

      {/* Historical Entries List */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
          Time History
        </h4>

        {loading ? (
          <div className="space-y-2.5 pt-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-3 rounded-xl border border-border/60 bg-card flex items-center justify-between gap-3 animate-pulse"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-full bg-muted/70 shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="h-3.5 bg-muted/70 rounded w-24" />
                      <div className="h-2.5 bg-muted/40 rounded w-16" />
                    </div>
                    <div className="h-3 bg-muted/50 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-6 w-14 bg-muted/50 rounded-lg shrink-0" />
              </div>
            ))}
          </div>
        ) : logHours.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-xs border border-dashed border-border rounded-2xl select-none">
            <Clock className="w-6 h-6 mx-auto mb-2 text-muted-foreground/60" />
            <p className="font-semibold text-foreground">No time logged yet</p>
            <p className="text-[11px] mt-0.5 text-muted-foreground">
              Track hours spent working on this task.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {logHours.map((entry) => {
              const isEditingThis = editingId === entry._id;
              const authorObj = entry.userId && typeof entry.userId === 'object' ? entry.userId : entry.user;
              const authorId = (authorObj?._id || authorObj?.id || entry.userId)?.toString();
              const authorName = authorObj?.name || 'Team Member';
              const authorAvatar = authorObj?.avatarUrl;

              // Strict permissions: only author or workspace owner can modify
              const isAuthor = currentUser?._id && authorId && authorId === currentUser._id.toString();
              const canModify = !isViewer && (isAuthor || isWorkspaceOwner);

              if (isEditingThis) {
                return (
                  <div
                    key={entry._id}
                    className="p-3.5 rounded-xl border border-primary/40 bg-secondary/30 space-y-3 animate-in fade-in duration-100"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-muted-foreground mb-1">
                          Hours
                        </label>
                        <input
                          type="number"
                          step="0.25"
                          min="0.25"
                          max="24"
                          value={editHours}
                          onChange={(e) => setEditHours(e.target.value)}
                          disabled={updating}
                          className="w-full px-2.5 py-1 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-muted-foreground mb-1">
                          Date
                        </label>
                        <input
                          ref={editDateInputRef}
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          onClick={(e) => {
                            try {
                              e.currentTarget.showPicker?.();
                            } catch (err) {}
                          }}
                          disabled={updating}
                          className="w-full px-2.5 py-1 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring text-foreground cursor-pointer"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground mb-1">
                        Note
                      </label>
                      <input
                        type="text"
                        maxLength={300}
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        disabled={updating}
                        className="w-full px-2.5 py-1 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                        placeholder="Note..."
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={updating}
                        className="px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(entry._id)}
                        disabled={updating}
                        className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        {updating ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={entry._id}
                  className="p-3 rounded-xl border border-border bg-card flex items-start justify-between gap-3 shadow-2xs hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {authorAvatar ? (
                      <img
                        src={authorAvatar}
                        alt={authorName}
                        className="w-7 h-7 rounded-full object-cover mt-0.5 border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center border border-primary/20 shrink-0 mt-0.5">
                        {authorName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">
                          {authorName}
                        </span>
                        {isAuthor && (
                          <span className="text-[9px] font-medium px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20">
                            You
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {entry.date
                            ? new Date(entry.date).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : 'Unknown date'}
                        </span>
                      </div>

                      {entry.note && (
                        <p className="text-xs text-foreground/90 mt-1 leading-relaxed break-words">
                          {entry.note}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-bold font-mono">
                      {entry.hours} {entry.hours === 1 ? 'hr' : 'hrs'}
                    </span>

                    {canModify && (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          title="Edit time log"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLog(entry._id)}
                          disabled={deletingId === entry._id}
                          title="Delete time log"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {deletingId === entry._id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
