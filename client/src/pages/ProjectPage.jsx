import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import { api } from '../api/axios';
import { useSocket } from '../context/SocketContext';
import {
  applyTaskCreated,
  applyTaskUpdated,
  applyTaskMoved,
  applyTaskDeleted,
  applyListCreated,
  applyListUpdated,
  applyListDeleted,
} from '../utils/kanbanPatch';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  FolderKanban,
  Kanban,
  AlertCircle,
  Loader2,
  FolderPlus,
  History,
} from 'lucide-react';
import { ListColumn } from '../components/kanban/ListColumn';
import { TaskItem } from '../components/kanban/TaskItem';
import { TaskDetailModal } from '../components/task/TaskDetailModal';
import { ActivityFeed } from '../components/activity/ActivityFeed';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const ProjectPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { workspace, workspaceId, currentUserRole, refreshProjects, refreshTrigger } =
    useOutletContext();
  const { socket, isConnected, reconnectCounter } = useSocket();
  const { user: currentUser } = useAuth();
  const { toast, addToast } = useToast();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [presenceUsers, setPresenceUsers] = useState([]);

  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const getAssigneeIds = (assignees) => {
    if (!Array.isArray(assignees)) return [];
    return assignees
      .map((a) => {
        if (!a) return null;
        if (typeof a === 'string') return a;
        return (a._id || a.id || a).toString();
      })
      .filter(Boolean);
  };

  // Activity feed sidebar state and live refresh trigger
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [activityRefreshTrigger, setActivityRefreshTrigger] = useState(0);

  // Selected task for detail inspection / editing
  const [selectedTask, setSelectedTask] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const isDetailOpenRef = useRef(isDetailOpen);
  useEffect(() => {
    isDetailOpenRef.current = isDetailOpen;
  }, [isDetailOpen]);

  const selectedTaskRef = useRef(selectedTask);
  useEffect(() => {
    selectedTaskRef.current = selectedTask;
  }, [selectedTask]);

  // Memoized mapping of member ID -> user object for avatar and name resolution
  const membersMap = React.useMemo(() => {
    const map = new Map();
    for (const m of workspace?.members || []) {
      const u = m?.userId && typeof m.userId === 'object' ? m.userId : m;
      const id = (u?._id || u?.id || m?._id || m?.id)?.toString();
      if (id) {
        map.set(id, {
          _id: id,
          name: u.name || 'Team Member',
          email: u.email || '',
          avatarUrl: u.avatarUrl || null,
          role: m.role || 'editor',
        });
      }
    }
    return map;
  }, [workspace?.members]);

  // Memoized mapping of listId -> listTitle for human-readable activity sentences
  const listsMap = React.useMemo(() => {
    const map = {};
    for (const l of project?.lists || []) {
      map[l._id?.toString()] = l.title;
    }
    return map;
  }, [project?.lists]);

  // Active task currently being dragged (for DragOverlay)
  const [activeTask, setActiveTask] = useState(null);

  // DnD Sensors: 6px distance activation constraint allows regular clicks to open modal without dragging
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch project with sorted lists & tasks
  const fetchProject = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`/projects/${projectId}`);
      setProject(data.project);
    } catch (err) {
      console.error('Failed to fetch project:', err);
      setError(err.response?.data?.message || 'Failed to load project details.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject, refreshTrigger]);

  // Socket.io room management, live presence and mutation sync
  useEffect(() => {
    if (!socket || !projectId) return;

    // Join room & fetch current presence roster
    socket.emit('project:join', { projectId });
    socket.emit('project:presence:request', { projectId });

    const handlePresenceList = (data) => {
      if (data?.projectId?.toString() === projectId?.toString()) {
        const users = data.users || data.members || data.roster || [];
        setPresenceUsers(users);
      }
    };

    const handleMemberPresence = (data) => {
      if (!data?.userId) return;
      setPresenceUsers((prev) => {
        if (data.status === 'joined') {
          if (prev.some((u) => u.userId === data.userId)) return prev;
          return [...prev, data];
        }
        if (data.status === 'left') {
          return prev.filter((u) => u.userId !== data.userId);
        }
        return prev;
      });
    };

    const handleRemoteTaskCreated = (data) => {
      const task = data?.task || data;
      if (task?.projectId?.toString() === projectId?.toString()) {
        const currentUserId = (currentUserRef.current?._id || currentUserRef.current?.id)?.toString();
        const taskAssignees = getAssigneeIds(task.assignees);
        if (currentUserId && taskAssignees.includes(currentUserId)) {
          addToast({
            id: Date.now() + Math.random(),
            title: 'Task Assigned',
            message: `You were assigned to "${task.title || 'a task'}"`,
            type: 'info',
          });
        }
        setProject((prev) => applyTaskCreated(prev, task));
        setActivityRefreshTrigger((prev) => prev + 1);
      }
    };

    const handleRemoteTaskUpdated = (data) => {
      const task = data?.task || data;
      if (task?.projectId?.toString() === projectId?.toString()) {
        const currentUserId = (currentUserRef.current?._id || currentUserRef.current?.id)?.toString();
        const updatedAssignees = getAssigneeIds(task.assignees);
        if (currentUserId && updatedAssignees.includes(currentUserId)) {
          let wasAlreadyAssigned = false;
          if (projectRef.current?.lists) {
            for (const list of projectRef.current.lists) {
              const existing = list.tasks?.find((t) => t._id?.toString() === task._id?.toString());
              if (existing) {
                const prevAssignees = getAssigneeIds(existing.assignees);
                if (prevAssignees.includes(currentUserId)) {
                  wasAlreadyAssigned = true;
                }
                break;
              }
            }
          }
          if (!wasAlreadyAssigned) {
            addToast({
              id: Date.now() + Math.random(),
              title: 'Task Assigned',
              message: `You were assigned to "${task.title || 'a task'}"`,
              type: 'info',
            });
          }
        }
        setProject((prev) => applyTaskUpdated(prev, task));
        setSelectedTask((prev) => (prev?._id === task._id ? { ...prev, ...task } : prev));
        setActivityRefreshTrigger((prev) => prev + 1);
      }
    };

    const handleRemoteTaskMoved = (data) => {
      const task = data?.task || data;
      if (task?.projectId?.toString() === projectId?.toString()) {
        setProject((prev) => applyTaskMoved(prev, task));
        setActivityRefreshTrigger((prev) => prev + 1);
      }
    };

    const handleRemoteTaskDeleted = (data) => {
      const deletedId = (data?.taskId || data?._id || data)?.toString();
      if (deletedId) {
        setProject((prev) => applyTaskDeleted(prev, deletedId));
        setSelectedTask((prev) => {
          if (prev?._id === deletedId) {
            setIsDetailOpen(false);
            return null;
          }
          return prev;
        });
        setActivityRefreshTrigger((prev) => prev + 1);
      }
    };

    const handleRemoteListCreated = (data) => {
      const list = data?.list || data;
      if (list?.projectId?.toString() === projectId?.toString()) {
        setProject((prev) => applyListCreated(prev, list));
        setActivityRefreshTrigger((prev) => prev + 1);
      }
    };

    const handleRemoteListUpdated = (data) => {
      const list = data?.list || data;
      if (list?.projectId?.toString() === projectId?.toString()) {
        setProject((prev) => applyListUpdated(prev, list));
        setActivityRefreshTrigger((prev) => prev + 1);
      }
    };

    const handleRemoteListDeleted = (data) => {
      const deletedListId = (data?.listId || data?._id || data)?.toString();
      if (deletedListId) {
        setProject((prev) => applyListDeleted(prev, deletedListId));
        setActivityRefreshTrigger((prev) => prev + 1);
      }
    };

    const handleRemoteProjectDeleted = (data) => {
      const deletedPid = (data?.projectId || data?._id || data)?.toString();
      if (deletedPid === projectId?.toString()) {
        toast.error('This project has been deleted.');
        navigate(`/workspaces/${workspaceId}/all`);
      }
    };

    const handleRemoteSubitemMutation = (data) => {
      const targetTaskId = data?.taskId?.toString();
      setActivityRefreshTrigger((prev) => prev + 1);

      if (targetTaskId && data.subitemProgress) {
        setProject((prev) => {
          if (!prev || !prev.lists) return prev;
          return {
            ...prev,
            lists: prev.lists.map((list) => ({
              ...list,
              tasks: (list.tasks || []).map((t) =>
                t._id?.toString() === targetTaskId
                  ? { ...t, subitemProgress: data.subitemProgress }
                  : t
              ),
            })),
          };
        });
        setSelectedTask((prev) =>
          prev?._id?.toString() === targetTaskId
            ? { ...prev, subitemProgress: data.subitemProgress }
            : prev
        );
      }
    };

    const handleRemoteGenericMutation = () => {
      setActivityRefreshTrigger((prev) => prev + 1);
    };

    const handleRemoteCommentCreated = (data) => {
      handleRemoteGenericMutation();
      const currentUserId = (currentUserRef.current?._id || currentUserRef.current?.id)?.toString();
      const cTaskId = data?.taskId?.toString();
      const authorId = (data?.comment?.authorId?._id || data?.comment?.authorId)?.toString();

      if (
        isDetailOpenRef.current &&
        selectedTaskRef.current &&
        selectedTaskRef.current._id?.toString() === cTaskId &&
        currentUserId &&
        authorId !== currentUserId
      ) {
        const taskAssignees = getAssigneeIds(selectedTaskRef.current.assignees);
        if (taskAssignees.includes(currentUserId)) {
          const authorName = data?.comment?.authorId?.name || 'A team member';
          addToast({
            id: Date.now() + Math.random(),
            title: 'New Comment',
            message: `${authorName} commented on "${selectedTaskRef.current.title || 'this task'}"`,
            type: 'info',
          });
        }
      }
    };

    socket.on('project:presence:list', handlePresenceList);
    socket.on('member:presence', handleMemberPresence);
    socket.on('task:created', handleRemoteTaskCreated);
    socket.on('task:updated', handleRemoteTaskUpdated);
    socket.on('task:moved', handleRemoteTaskMoved);
    socket.on('task:deleted', handleRemoteTaskDeleted);
    socket.on('list:created', handleRemoteListCreated);
    socket.on('list:updated', handleRemoteListUpdated);
    socket.on('list:deleted', handleRemoteListDeleted);
    socket.on('project:deleted', handleRemoteProjectDeleted);
    socket.on('subitem:created', handleRemoteSubitemMutation);
    socket.on('subitem:updated', handleRemoteSubitemMutation);
    socket.on('subitem:deleted', handleRemoteSubitemMutation);
    socket.on('attachment:created', handleRemoteGenericMutation);
    socket.on('attachment:deleted', handleRemoteGenericMutation);
    socket.on('comment:created', handleRemoteCommentCreated);
    socket.on('comment:deleted', handleRemoteGenericMutation);

    return () => {
      socket.emit('project:leave', { projectId });
      socket.off('project:presence:list', handlePresenceList);
      socket.off('member:presence', handleMemberPresence);
      socket.off('task:created', handleRemoteTaskCreated);
      socket.off('task:updated', handleRemoteTaskUpdated);
      socket.off('task:moved', handleRemoteTaskMoved);
      socket.off('task:deleted', handleRemoteTaskDeleted);
      socket.off('list:created', handleRemoteListCreated);
      socket.off('list:updated', handleRemoteListUpdated);
      socket.off('list:deleted', handleRemoteListDeleted);
      socket.off('project:deleted', handleRemoteProjectDeleted);
      socket.off('subitem:created', handleRemoteSubitemMutation);
      socket.off('subitem:updated', handleRemoteSubitemMutation);
      socket.off('subitem:deleted', handleRemoteSubitemMutation);
      socket.off('attachment:created', handleRemoteGenericMutation);
      socket.off('attachment:deleted', handleRemoteGenericMutation);
      socket.off('comment:created', handleRemoteCommentCreated);
      socket.off('comment:deleted', handleRemoteGenericMutation);
    };
  }, [socket, projectId, workspaceId, navigate]);

  // Re-fetch project and rejoin room on socket reconnection
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    if (reconnectCounter > 0) {
      fetchProject();
      if (socket && projectId) {
        socket.emit('project:join', { projectId });
        socket.emit('project:presence:request', { projectId });
      }
    }
  }, [reconnectCounter, fetchProject, socket, projectId]);

  // Local state update when a task is updated in TaskDetailModal
  const handleTaskUpdated = (updatedTask) => {
    setProject((prev) => applyTaskUpdated(prev, updatedTask));
    setSelectedTask((prev) => (prev?._id === updatedTask._id ? updatedTask : prev));
    setActivityRefreshTrigger((prev) => prev + 1);
  };

  // Local state update when a task is deleted
  const handleTaskDeleted = (deletedTaskId) => {
    setProject((prev) => applyTaskDeleted(prev, deletedTaskId));
    setIsDetailOpen(false);
    setSelectedTask(null);
    setActivityRefreshTrigger((prev) => prev + 1);
  };

  // -------------------------------------------------------------
  // Drag-and-Drop Handlers
  // -------------------------------------------------------------
  const handleDragStart = (event) => {
    if (currentUserRole === 'viewer') return;

    const { active } = event;
    const taskId = active.id;

    for (const list of project?.lists || []) {
      const found = list.tasks?.find((t) => t._id === taskId);
      if (found) {
        setActiveTask(found);
        break;
      }
    }
  };

  const handleDragOver = (event) => {
    if (currentUserRole === 'viewer') return;

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    setProject((prev) => {
      if (!prev) return prev;

      const sourceList = prev.lists?.find((l) =>
        l.tasks?.some((t) => t._id === activeId)
      );
      if (!sourceList) return prev;

      // over target can be a column (overId === list._id) or a task (overId === task._id)
      let targetList = prev.lists?.find((l) => l._id === overId);
      if (!targetList) {
        targetList = prev.lists?.find((l) =>
          l.tasks?.some((t) => t._id === overId)
        );
      }
      if (!targetList) return prev;

      // If moving inside the same list, dragEnd handles the final ordering
      if (sourceList._id === targetList._id) return prev;

      // Optimistically move task across columns for smooth preview reflow
      const taskToMove = sourceList.tasks?.find((t) => t._id === activeId);
      if (!taskToMove) return prev;

      const updatedSourceTasks = sourceList.tasks.filter((t) => t._id !== activeId);
      const updatedTargetTasks = [...(targetList.tasks || [])];

      const overIndex = targetList.tasks?.findIndex((t) => t._id === overId);
      const insertIndex = overIndex >= 0 ? overIndex : updatedTargetTasks.length;
      updatedTargetTasks.splice(insertIndex, 0, {
        ...taskToMove,
        listId: targetList._id,
      });

      return {
        ...prev,
        lists: prev.lists.map((l) => {
          if (l._id === sourceList._id) return { ...l, tasks: updatedSourceTasks };
          if (l._id === targetList._id) return { ...l, tasks: updatedTargetTasks };
          return l;
        }),
      };
    });
  };

  const handleDragEnd = async (event) => {
    if (currentUserRole === 'viewer') {
      setActiveTask(null);
      return;
    }

    const { active, over } = event;
    setActiveTask(null);

    if (!over || !project) return;

    const activeId = active.id;
    const overId = over.id;

    const previousProject = project;

    // Find current list of the dragged task
    let currentList = null;
    let taskIndex = -1;
    let taskToMove = null;

    for (const l of project.lists || []) {
      const idx = l.tasks?.findIndex((t) => t._id === activeId);
      if (idx >= 0) {
        currentList = l;
        taskIndex = idx;
        taskToMove = l.tasks[idx];
        break;
      }
    }

    if (!currentList || !taskToMove) return;

    // Find destination target list
    let targetList = project.lists.find((l) => l._id === overId);
    let targetIndex = -1;

    if (targetList) {
      targetIndex = targetList.tasks?.length || 0;
    } else {
      targetList = project.lists.find((l) =>
        l.tasks?.some((t) => t._id === overId)
      );
      if (targetList) {
        targetIndex = targetList.tasks?.findIndex((t) => t._id === overId);
      }
    }

    if (!targetList) return;

    // Reorder within the same list if positions changed
    let finalProject = project;
    if (currentList._id === targetList._id) {
      if (taskIndex !== targetIndex && targetIndex >= 0) {
        const reordered = [...currentList.tasks];
        const [removed] = reordered.splice(taskIndex, 1);
        reordered.splice(targetIndex, 0, removed);

        const withOrder = reordered.map((t, idx) => ({ ...t, order: idx }));
        finalProject = {
          ...project,
          lists: project.lists.map((l) =>
            l._id === currentList._id ? { ...l, tasks: withOrder } : l
          ),
        };
        setProject(finalProject);
      }
    }

    // Calculate final order index
    const targetTasks =
      finalProject.lists.find((l) => l._id === targetList._id)?.tasks || [];
    const finalIndex = targetTasks.findIndex((t) => t._id === activeId);
    const finalOrder = finalIndex >= 0 ? finalIndex : 0;

    // Fire PATCH /api/tasks/:id/move in the background
    try {
      await api.patch(`/tasks/${activeId}/move`, {
        listId: targetList._id,
        order: finalOrder,
      });
      setActivityRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to persist task move:', err);
      // Rollback to previous state on failure
      setProject(previousProject);
      toast.error(err.response?.data?.message || 'Failed to move task. Reverting change.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-5 max-w-full mx-auto animate-pulse">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted/60" />
            <div>
              <div className="h-5 bg-muted/60 rounded-md w-48" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 bg-muted/50 rounded-xl w-24" />
            <div className="h-8 bg-muted/50 rounded-xl w-20" />
          </div>
        </div>

        {/* 4-Column Board Skeleton */}
        <div className="flex items-stretch gap-3.5 overflow-x-auto pb-6 min-h-[calc(100vh-220px)] pt-1 snap-x snap-mandatory scroll-smooth overscroll-x-contain">
          {[1, 2, 3, 4].map((colIndex) => (
            <div
              key={colIndex}
              className="flex-1 snap-center sm:snap-align-none w-[85vw] max-w-[340px] sm:w-auto sm:min-w-[300px] bg-card/60 border border-border rounded-2xl p-3 flex flex-col h-[520px] shrink-0 space-y-3"
            >
              <div className="flex items-center justify-between pb-2.5 px-1 border-b border-border/60">
                <div className="h-3.5 bg-muted/60 rounded-md w-24" />
                <div className="h-4 bg-muted/50 rounded-full w-6" />
              </div>
              <div className="space-y-2.5 flex-1">
                {[1, 2, 3].map((cardIndex) => (
                  <div
                    key={cardIndex}
                    className="p-3.5 bg-background border border-border/70 rounded-xl space-y-2.5"
                  >
                    <div className="flex justify-between items-center">
                      <div className="h-3.5 bg-muted/60 rounded w-16" />
                      <div className="h-3 bg-muted/40 rounded w-8" />
                    </div>
                    <div className="h-4 bg-muted/70 rounded w-3/4" />
                    <div className="flex justify-between items-center pt-1 border-t border-border/30">
                      <div className="h-3 bg-muted/50 rounded w-16" />
                      <div className="w-5 h-5 rounded-full bg-muted/60" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-8 max-w-lg mx-auto bg-card border border-border rounded-2xl text-center shadow-sm">
        <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
        <h3 className="text-base font-bold font-serif text-foreground mb-1">
          Project Not Found
        </h3>
        <p className="text-xs text-muted-foreground">{error || 'Unable to load this project.'}</p>
      </div>
    );
  }

  const lists = project.lists || [];

  return (
    <div className="space-y-5 max-w-full mx-auto animate-in fade-in duration-200">
      {/* Project Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-serif text-foreground leading-tight">
              {project.title}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Active Viewers Presence Stack */}
          {presenceUsers.length > 0 && (
            <div className="flex items-center gap-1.5 bg-secondary/60 px-2.5 py-1 rounded-xl border border-border">
              <div className="flex items-center -space-x-2 overflow-hidden">
                {presenceUsers.slice(0, 5).map((u) => {
                  const initial = (u.name || 'U').charAt(0).toUpperCase();
                  return (
                    <div
                      key={u.userId}
                      title={`${u.name} (Active)`}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 text-primary border-2 border-card text-[11px] font-bold shadow-xs hover:scale-110 transition-transform cursor-pointer"
                    >
                      {initial}
                    </div>
                  );
                })}
              </div>
              {presenceUsers.length > 5 && (
                <span className="text-[11px] font-semibold text-muted-foreground pl-0.5">
                  +{presenceUsers.length - 5}
                </span>
              )}
            </div>
          )}

          {/* Real-time Connection Status Indicator */}
          <span
            className={`inline-flex items-center justify-center p-2 rounded-xl border transition-colors ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
            }`}
            title={isConnected ? 'Live real-time sync active' : 'Connecting to real-time server...'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
          </span>

          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold border border-border">
            <Kanban className="w-3.5 h-3.5 text-primary" />
            Project Board
          </span>

          {/* Activity Feed Toggle Button */}
          <button
            onClick={() => setIsActivityOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
              isActivityOpen
                ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                : 'bg-secondary text-secondary-foreground border-border hover:bg-secondary/80'
            }`}
            title="Toggle Project Activity Feed"
          >
            <History className="w-3.5 h-3.5" />
            <span>Activity</span>
          </button>
        </div>
      </div>

      {/* Kanban Board Container with DndContext */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex items-stretch gap-3.5 overflow-x-auto pb-6 min-h-[calc(100vh-220px)] pt-1 snap-x snap-mandatory scroll-smooth overscroll-x-contain">
          {lists.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-card border border-dashed border-border rounded-2xl min-h-[400px]">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Kanban className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold font-serif text-foreground mb-1">
                No lists on this board
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                Default columns (To Do, In Progress, In Review, Done) can be added or customized.
              </p>
            </div>
          ) : (
            lists.map((list, index) => (
              <React.Fragment key={list._id}>
                <ListColumn
                  list={list}
                  projectId={projectId}
                  workspaceId={workspaceId}
                  currentUserRole={currentUserRole}
                  membersMap={membersMap}
                  onTaskClick={(task, parentList) => {
                    setSelectedTask({
                      ...task,
                      projectName: project.title,
                      listName: parentList?.title || 'List',
                    });
                    setIsDetailOpen(true);
                  }}
                />
                {/* Vertical divider line between the 4 columns */}
                {index < lists.length - 1 && (
                  <div className="w-px self-stretch bg-border shrink-0 my-1 hidden lg:block" />
                )}
              </React.Fragment>
            ))
          )}
        </div>

        {/* Lifted DragOverlay when a task card is in motion */}
        <DragOverlay>
          {activeTask ? (
            <div className="w-72">
              <TaskItem task={activeTask} isOverlay membersMap={membersMap} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          isOpen={isDetailOpen}
          onClose={() => {
            setIsDetailOpen(false);
            setSelectedTask(null);
          }}
          currentUserRole={currentUserRole}
          members={workspace?.members || []}
          membersMap={membersMap}
          onTaskUpdated={handleTaskUpdated}
          onTaskDeleted={handleTaskDeleted}
        />
      )}

      {/* Activity Feed Slide-out Drawer */}
      <ActivityFeed
        isOpen={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
        projectId={projectId}
        listsMap={listsMap}
        refreshTrigger={activityRefreshTrigger}
      />
    </div>
  );
};
