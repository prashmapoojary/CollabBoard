import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/axios';
import { ActivityItem } from './ActivityItem';
import {
  X,
  History,
  RotateCcw,
  Loader2,
  AlertCircle,
  Inbox,
  ArrowDown,
} from 'lucide-react';

export const ActivityFeed = ({
  isOpen,
  onClose,
  projectId,
  listsMap = {},
  refreshTrigger = 0,
}) => {
  const [activities, setActivities] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const hasLoadedOnceRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset when project ID changes
  useEffect(() => {
    hasLoadedOnceRef.current = false;
    setActivities([]);
    setPage(1);
    setTotalPages(1);
    setTotal(0);
    setError('');
  }, [projectId]);

  // Initial load or full refresh
  const loadFirstPage = useCallback(
    async (showSpinner = true) => {
      if (!projectId) return;

      if (showSpinner) setLoadingInitial(true);
      setError('');

      try {
        const { data } = await api.get(`/projects/${projectId}/activity`, {
          params: { page: 1, limit: 20 },
        });

        if (isMountedRef.current) {
          setActivities(data.entries || []);
          setPage(1);
          setTotalPages(data.totalPages || 1);
          setTotal(data.total || 0);
          hasLoadedOnceRef.current = true;
        }
      } catch (err) {
        if (isMountedRef.current) {
          console.error('Failed to load activity feed:', err);
          setError(err.response?.data?.message || 'Failed to load activity.');
        }
      } finally {
        if (isMountedRef.current && showSpinner) {
          setLoadingInitial(false);
        }
      }
    },
    [projectId]
  );

  // Live update: fetch latest page 1 and prepend any new entries, deduplicating by _id
  const refreshLatest = useCallback(async () => {
    if (!projectId || !hasLoadedOnceRef.current) return;

    try {
      const { data } = await api.get(`/projects/${projectId}/activity`, {
        params: { page: 1, limit: 20 },
      });

      if (!isMountedRef.current) return;

      const newEntries = data.entries || [];
      setActivities((prev) => {
        const existingIds = new Set(prev.map((a) => a._id?.toString()));
        const uniqueIncoming = newEntries.filter(
          (item) => !existingIds.has(item._id?.toString())
        );

        if (uniqueIncoming.length === 0) {
          return prev;
        }
        return [...uniqueIncoming, ...prev];
      });

      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.warn('Silent live activity refresh error:', err?.message);
    }
  }, [projectId]);

  // Lazy-load on first open
  useEffect(() => {
    if (isOpen && !hasLoadedOnceRef.current) {
      loadFirstPage(true);
    }
  }, [isOpen, loadFirstPage]);

  // Refresh when external socket refresh trigger fires
  const prevTriggerRef = useRef(refreshTrigger);
  useEffect(() => {
    if (refreshTrigger !== prevTriggerRef.current) {
      prevTriggerRef.current = refreshTrigger;
      if (hasLoadedOnceRef.current) {
        refreshLatest();
      }
    }
  }, [refreshTrigger, refreshLatest]);

  // Escape key closes drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Pagination: Load older activity
  const handleLoadMore = async () => {
    if (loadingMore || page >= totalPages || !projectId) return;

    const nextPage = page + 1;
    setLoadingMore(true);

    try {
      const { data } = await api.get(`/projects/${projectId}/activity`, {
        params: { page: nextPage, limit: 20 },
      });

      if (isMountedRef.current) {
        const incoming = data.entries || [];
        setActivities((prev) => {
          const existingIds = new Set(prev.map((a) => a._id?.toString()));
          const uniqueIncoming = incoming.filter(
            (item) => !existingIds.has(item._id?.toString())
          );
          return [...prev, ...uniqueIncoming];
        });
        setPage(nextPage);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error('Failed to load older activities:', err);
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingMore(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Semi-transparent Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 pointer-events-none">
        <div
          className="w-screen max-w-md bg-card border-l border-border shadow-2xl flex flex-col pointer-events-auto animate-in slide-in-from-right duration-200 text-card-foreground"
          role="dialog"
          aria-modal="true"
          aria-label="Project Activity Feed"
        >
          {/* Drawer Header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-secondary/30">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold font-serif text-foreground leading-none">
                  Project Activity
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {total > 0
                    ? `${total} ${total === 1 ? 'event' : 'events'} recorded`
                    : 'Live audit trail'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => loadFirstPage(true)}
                disabled={loadingInitial}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer transition-colors"
                title="Refresh Activity"
              >
                <RotateCcw
                  className={`w-4 h-4 ${loadingInitial ? 'animate-spin text-primary' : ''}`}
                />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer transition-colors"
                title="Close Feed"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1 divide-y divide-border/40">
            {/* Error State */}
            {error && (
              <div className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex flex-col gap-2 text-center my-2">
                <AlertCircle className="w-5 h-5 mx-auto" />
                <p>{error}</p>
                <button
                  onClick={() => loadFirstPage(true)}
                  className="mt-1 px-3 py-1 bg-destructive text-destructive-foreground rounded-lg font-medium self-center hover:opacity-90 transition-opacity"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading Skeleton */}
            {loadingInitial ? (
              <div className="space-y-4 pt-2">
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
                    <div className="flex-1 space-y-2 py-0.5">
                      <div className="h-3 bg-muted rounded-md w-3/4" />
                      <div className="h-2.5 bg-muted/60 rounded-md w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities.length === 0 && !error ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground my-8">
                <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mb-3 border border-border">
                  <Inbox className="w-6 h-6 text-muted-foreground/60" />
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-1">
                  No activity yet
                </h4>
                <p className="text-xs text-muted-foreground max-w-[240px]">
                  Actions, moves, and updates on this project will appear here in real time.
                </p>
              </div>
            ) : (
              /* Activity Timeline List */
              activities.map((activity) => (
                <div key={activity._id} className="pt-1 first:pt-0">
                  <ActivityItem activity={activity} listsMap={listsMap} />
                </div>
              ))
            )}
          </div>

          {/* Drawer Footer with Pagination Controls */}
          {activities.length > 0 && (
            <div className="p-3.5 border-t border-border bg-secondary/20 flex items-center justify-center">
              {page < totalPages ? (
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full py-2 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-semibold border border-border flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      <span>Loading older activity...</span>
                    </>
                  ) : (
                    <>
                      <ArrowDown className="w-3.5 h-3.5" />
                      <span>Load older activity ({total - activities.length} remaining)</span>
                    </>
                  )}
                </button>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Beginning of activity history reached
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
