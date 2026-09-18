import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/axios';
import { formatRelativeTime } from '../../utils/formatActivity';
import {
  MessageSquare,
  Send,
  Trash2,
  Loader2,
  AlertCircle,
  Clock,
  Lock,
} from 'lucide-react';

export const TaskComments = ({
  taskId,
  currentUserRole = 'viewer',
  onCommentsCountChange,
}) => {
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();
  const { toast } = useToast();

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [newCommentText, setNewCommentText] = useState('');

  const commentsEndRef = useRef(null);

  // Fetch comments (oldest first)
  const fetchComments = useCallback(async () => {
    if (!taskId) return;

    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`/tasks/${taskId}/comments?limit=50`);
      const list = data.comments || [];
      setComments(list);
      onCommentsCountChange?.(list.length);
    } catch (err) {
      console.error('Failed to load comments:', err);
      setError(err.response?.data?.message || 'Failed to load comments.');
    } finally {
      setLoading(false);
    }
  }, [taskId, onCommentsCountChange]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Socket.io real-time live sync for comments
  useEffect(() => {
    if (!socket || !taskId) return;

    const handleRemoteCommentCreated = (data) => {
      if (data?.taskId?.toString() === taskId?.toString() && data.comment) {
        setComments((prev) => {
          if (prev.some((c) => c._id?.toString() === data.comment._id?.toString())) {
            return prev;
          }
          const updated = [...prev, data.comment];
          onCommentsCountChange?.(updated.length);
          return updated;
        });

        // Auto-scroll to latest comment
        setTimeout(() => {
          commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    };

    const handleRemoteCommentDeleted = (data) => {
      if (data?.taskId?.toString() === taskId?.toString() && data.commentId) {
        setComments((prev) => {
          const updated = prev.filter(
            (c) => c._id?.toString() !== data.commentId.toString()
          );
          onCommentsCountChange?.(updated.length);
          return updated;
        });
      }
    };

    socket.on('comment:created', handleRemoteCommentCreated);
    socket.on('comment:deleted', handleRemoteCommentDeleted);

    return () => {
      socket.off('comment:created', handleRemoteCommentCreated);
      socket.off('comment:deleted', handleRemoteCommentDeleted);
    };
  }, [socket, taskId, onCommentsCountChange]);

  // Post comment handler
  const handlePostComment = async (e) => {
    e?.preventDefault();
    const trimmed = newCommentText.trim();
    if (!trimmed || posting || currentUserRole === 'viewer') return;

    try {
      setPosting(true);
      setError('');

      const { data } = await api.post(`/tasks/${taskId}/comments`, {
        text: trimmed,
      });

      if (data?.comment) {
        setComments((prev) => {
          if (prev.some((c) => c._id?.toString() === data.comment._id?.toString())) {
            return prev;
          }
          const updated = [...prev, data.comment];
          onCommentsCountChange?.(updated.length);
          return updated;
        });
        setNewCommentText('');

        setTimeout(() => {
          commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
      setError(err.response?.data?.message || 'Failed to post comment.');
    } finally {
      setPosting(false);
    }
  };

  // Delete comment handler
  const handleDeleteComment = async (commentId) => {
    if (!commentId || deletingId) return;
    if (!window.confirm('Are you sure you want to delete this comment?')) return;

    try {
      setDeletingId(commentId);
      await api.delete(`/tasks/${taskId}/comments/${commentId}`);

      setComments((prev) => {
        const updated = prev.filter((c) => c._id?.toString() !== commentId.toString());
        onCommentsCountChange?.(updated.length);
        return updated;
      });
    } catch (err) {
      console.error('Failed to delete comment:', err);
      toast.error(err.response?.data?.message || 'Failed to delete comment.');
    } finally {
      setDeletingId(null);
    }
  };

  // Permission check for deleting an individual comment
  const canDelete = (comment) => {
    if (currentUserRole === 'owner') return true;
    const authorId = comment.authorId?._id || comment.authorId;
    const currentUserId = currentUser?._id || currentUser?.id;
    return Boolean(
      authorId && currentUserId && authorId.toString() === currentUserId.toString()
    );
  };

  return (
    <div className="flex flex-col h-full min-h-[350px]">
      {/* Error alert */}
      {error && (
        <div className="mb-3 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 max-h-[420px]">
        {loading ? (
          <div className="space-y-3 pt-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-xl bg-secondary/20 border border-border/40 animate-pulse"
              >
                <div className="w-7 h-7 rounded-full bg-muted/70 shrink-0" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="flex items-center gap-2">
                    <div className="h-3 bg-muted/70 rounded w-24" />
                    <div className="h-2.5 bg-muted/50 rounded w-12" />
                  </div>
                  <div className="h-3 bg-muted/60 rounded w-5/6" />
                  <div className="h-3 bg-muted/40 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground">
            <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center mb-2 border border-border">
              <MessageSquare className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <p className="text-xs font-semibold text-foreground">No comments yet</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Be the first to share an update or leave feedback.
            </p>
          </div>
        ) : (
          comments.map((comment) => {
            const author = comment.author || comment.authorId;
            const authorName =
              typeof author === 'object' && author?.name
                ? author.name
                : 'Team Member';
            const avatarUrl = typeof author === 'object' ? author?.avatarUrl : null;
            const initial = authorName.charAt(0).toUpperCase();
            const isAuthorDeleting = deletingId === comment._id;
            const hasDeletePermission = canDelete(comment);

            return (
              <div
                key={comment._id}
                className="group relative flex items-start gap-3 p-3 rounded-xl bg-secondary/30 border border-border/50 hover:border-border transition-colors"
              >
                {/* Author Avatar / Initial */}
                <div className="shrink-0 mt-0.5">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={authorName}
                      className="w-7 h-7 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary/20 text-primary font-bold text-xs flex items-center justify-center border border-primary/30">
                      {initial}
                    </div>
                  )}
                </div>

                {/* Comment Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {authorName}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="w-2.5 h-2.5" />
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>

                    {/* Delete button (Author or Workspace Owner) */}
                    {hasDeletePermission && (
                      <button
                        onClick={() => handleDeleteComment(comment._id)}
                        disabled={isAuthorDeleting}
                        title="Delete comment"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all cursor-pointer"
                      >
                        {isAuthorDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-foreground mt-1 whitespace-pre-wrap leading-relaxed break-words">
                    {comment.text}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Comment Input Footer */}
      <div className="pt-3 border-t border-border mt-3">
        {currentUserRole === 'viewer' ? (
          <div className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-secondary/40 border border-border text-muted-foreground text-xs">
            <Lock className="w-3.5 h-3.5 text-muted-foreground/60" />
            <span>Viewers have read-only access and cannot post comments.</span>
          </div>
        ) : (
          <form onSubmit={handlePostComment} className="space-y-2">
            <div className="relative">
              <textarea
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Write a comment... (Enter to post, Shift+Enter for new line)"
                rows={2}
                maxLength={2000}
                disabled={posting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handlePostComment();
                  }
                }}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground resize-none"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {newCommentText.length > 0 ? `${newCommentText.length}/2000` : ''}
              </span>

              <button
                type="submit"
                disabled={posting || !newCommentText.trim()}
                className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-all shadow-xs"
              >
                {posting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Posting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Post</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
