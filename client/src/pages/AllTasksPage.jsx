import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { api } from '../api/axios';
import {
  Search,
  Filter,
  Calendar,
  Tag,
  CheckSquare,
  Bug,
  BookOpen,
  FolderKanban,
  ListTodo,
  AlertCircle,
  Inbox,
  ArrowUpDown,
  Clock,
  ExternalLink,
  Paperclip,
} from 'lucide-react';
import { formatDueDate } from '../utils/dateUtils';
import { TaskDetailModal } from '../components/task/TaskDetailModal';

export const AllTasksPage = () => {
  const { workspaceId: routeWorkspaceId } = useParams();
  const context = useOutletContext() || {};
  const workspaceId = routeWorkspaceId || context.workspaceId;
  const workspace = context.workspace || null;
  const currentUserRole = context.currentUserRole || 'viewer';
  const refreshTrigger = context.refreshTrigger || 0;

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  // Filtering and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedProject, setSelectedProject] = useState('all');

  // Modal for viewing details
  const [activeTask, setActiveTask] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Fetch all projects, then all project details in parallel, flatten tasks
  const fetchAllTasks = useCallback(async () => {
    if (!workspaceId) return;

    try {
      setLoading(true);
      setError('');

      // 1. Fetch workspace projects
      const { data: projData } = await api.get(`/workspaces/${workspaceId}/projects`);
      const projectsList = projData.projects || [];

      if (projectsList.length === 0) {
        setTasks([]);
        return;
      }

      // 2. Fetch full detail for each project in parallel
      const detailPromises = projectsList.map((p) =>
        api
          .get(`/projects/${p._id}`)
          .then((res) => ({ project: res.data.project, error: null }))
          .catch((err) => ({ project: null, error: err }))
      );

      const results = await Promise.all(detailPromises);

      // 3. Flatten tasks across all lists and projects client-side
      const flattened = [];
      for (const res of results) {
        if (!res.project) continue;
        const p = res.project;
        for (const list of p.lists || []) {
          for (const task of list.tasks || []) {
            flattened.push({
              ...task,
              projectName: p.title,
              projectId: p._id,
              listName: list.title,
              listId: list._id,
            });
          }
        }
      }

      setTasks(flattened);
    } catch (err) {
      console.error('Failed to fetch tasks for workspace:', err);
      setError(err.response?.data?.message || 'Failed to load tasks across projects.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchAllTasks();
  }, [fetchAllTasks, refreshTrigger]);

  // Unique project names for filtering
  const projectOptions = useMemo(() => {
    const set = new Map();
    for (const t of tasks) {
      if (t.projectId && t.projectName) {
        set.set(t.projectId, t.projectName);
      }
    }
    return Array.from(set.entries()).map(([id, title]) => ({ id, title }));
  }, [tasks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Type filter
      if (selectedType !== 'all' && task.taskType !== selectedType) {
        return false;
      }

      // Project filter
      if (selectedProject !== 'all' && task.projectId !== selectedProject) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = task.title.toLowerCase().includes(query);
        const matchesProject = task.projectName?.toLowerCase().includes(query);
        const matchesList = task.listName?.toLowerCase().includes(query);
        const matchesDescription = task.description?.toLowerCase().includes(query);
        return matchesTitle || matchesProject || matchesList || matchesDescription;
      }

      return true;
    });
  }, [tasks, selectedType, selectedProject, searchQuery]);

  const handleRowClick = (task) => {
    setActiveTask(task);
    setIsDetailOpen(true);
  };

  const typeIconConfig = {
    bug: { icon: Bug, color: 'text-red-500 bg-red-500/10 border-red-500/20' },
    story: { icon: BookOpen, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
    task: { icon: CheckSquare, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  };

  const priorityConfig = {
    urgent: {
      label: 'Urgent',
      border: 'border-l-red-500',
      bg: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    },
    high: {
      label: 'High',
      border: 'border-l-amber-500',
      bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    },
    medium: {
      label: 'Medium',
      border: 'border-l-blue-500',
      bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    },
    low: {
      label: 'Low',
      border: 'border-l-slate-400 dark:border-l-slate-500',
      bg: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
    },
  };

  const formatDate = (dateStr) => {
    return formatDueDate(dateStr);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Page Header & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-serif tracking-tight text-foreground">
            All Tasks Overview
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Combined flat view of all tasks across projects in this workspace
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-xl bg-card border border-border text-xs font-semibold text-foreground shadow-2xs">
            {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-3 bg-card border border-border rounded-2xl shadow-sm flex flex-col md:flex-row items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks by title, project, or list..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap sm:flex-nowrap">
          {/* Type Filter */}
          <div className="flex items-center rounded-xl border border-input bg-background p-0.5 overflow-x-auto max-w-full">
            {['all', 'task', 'bug', 'story'].map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg capitalize transition-all cursor-pointer shrink-0 ${
                  selectedType === type
                    ? 'bg-primary text-primary-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Project Dropdown Filter */}
          {projectOptions.length > 1 && (
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="px-3 py-1.5 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground cursor-pointer flex-1 sm:flex-initial"
            >
              <option value="all">All Projects</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading ? (
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden p-6 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-12 w-full bg-muted/40 rounded-xl animate-pulse flex items-center px-4 justify-between"
            >
              <div className="flex items-center gap-3 w-1/3">
                <div className="w-4 h-4 bg-muted rounded" />
                <div className="h-3 bg-muted rounded w-3/4" />
              </div>
              <div className="flex gap-4 w-1/4">
                <div className="h-4 bg-muted rounded w-16" />
                <div className="h-4 bg-muted rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        /* Empty State */
        <div className="bg-card border border-border rounded-2xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold font-serif text-foreground mb-1">
            No Tasks Found
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
            {searchQuery || selectedType !== 'all' || selectedProject !== 'all'
              ? 'No tasks match the selected filters. Try clearing your search or filter options.'
              : 'There are no tasks in this workspace yet. Click the "Create" button in the top bar to add your first task.'}
          </p>
          {(searchQuery || selectedType !== 'all' || selectedProject !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedType('all');
                setSelectedProject('all');
              }}
              className="px-3 py-1.5 rounded-xl border border-border text-xs font-medium text-foreground hover:bg-muted cursor-pointer transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Card Feed (Phones < 640px) */}
          <div className="block sm:hidden space-y-3">
            {filteredTasks.map((task) => {
              const typeInfo = typeIconConfig[task.taskType] || typeIconConfig.task;
              const TypeIcon = typeInfo.icon;
              const formattedDue = formatDate(task.dueDate);
              const isOverdue =
                task.dueDate && new Date(task.dueDate) < new Date();
              const pConf = priorityConfig[task.priority] || priorityConfig.medium;

              return (
                <div
                  key={task._id}
                  onClick={() => handleRowClick(task)}
                  className={`p-4 bg-card border border-border border-l-4 rounded-2xl shadow-xs space-y-3 cursor-pointer hover:border-primary/50 transition-all active:scale-[0.99] ${pConf.border}`}
                >
                  {/* Header row: type icon + title + priority badge */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <div
                        className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${typeInfo.color}`}
                        title={`Type: ${task.taskType || 'task'}`}
                      >
                        <TypeIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-foreground leading-snug">
                          {task.title}
                        </h4>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border shrink-0 ${pConf.bg}`}
                    >
                      {pConf.label}
                    </span>
                  </div>

                  {/* Description snippet if present */}
                  {task.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 pl-8">
                      {task.description}
                    </p>
                  )}

                  {/* Meta tags row: Project, List, Due Date, Subitems, Attachments */}
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] pt-1 border-t border-border/50">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium bg-primary/10 text-primary border border-primary/20 truncate max-w-[130px]">
                      <FolderKanban className="w-3 h-3 shrink-0" />
                      <span className="truncate">{task.projectName}</span>
                    </span>

                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium bg-secondary text-secondary-foreground border border-border truncate max-w-[120px]">
                      <ListTodo className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{task.listName}</span>
                    </span>

                    {formattedDue && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium border ${
                          isOverdue
                            ? 'text-destructive bg-destructive/10 border-destructive/20 font-semibold'
                            : 'text-foreground bg-secondary/60 border-border'
                        }`}
                      >
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span>{formattedDue}</span>
                      </span>
                    )}

                    {task.subitemProgress?.total > 0 && (
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium border shrink-0 ${
                          task.subitemProgress.completed === task.subitemProgress.total
                            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                            : 'text-muted-foreground bg-secondary border-border'
                        }`}
                      >
                        <ListTodo className="w-3 h-3" />
                        <span>
                          {task.subitemProgress.completed}/{task.subitemProgress.total}
                        </span>
                      </span>
                    )}

                    {(task.attachmentCount > 0 || task.attachmentsCount > 0) && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium border shrink-0 text-muted-foreground bg-secondary border-border">
                        <Paperclip className="w-3 h-3 text-primary" />
                        <span>{task.attachmentCount || task.attachmentsCount}</span>
                      </span>
                    )}
                  </div>

                  {/* Assignees and Labels row */}
                  {((task.assignees && task.assignees.length > 0) || (task.labels && task.labels.length > 0)) && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      {/* Assignees */}
                      <div className="flex items-center">
                        {task.assignees && task.assignees.length > 0 && (() => {
                          const maxVisible = 3;
                          const total = task.assignees.length;
                          const visible = task.assignees.slice(0, maxVisible);
                          const overflow = total - maxVisible;

                          return (
                            <div className="flex items-center -space-x-1.5">
                              {visible.map((a, idx) => {
                                const isObj = typeof a === 'object' && a !== null;
                                const idStr = (isObj ? a._id || a.id : a)?.toString();
                                const resolvedUser = isObj ? a : membersMap?.get?.(idStr);
                                const name = resolvedUser?.name || (isObj ? a.name : 'User');
                                const avatar = resolvedUser?.avatarUrl || (isObj ? a.avatarUrl : null);
                                const key = idStr || idx;
                                return avatar ? (
                                  <img
                                    key={key}
                                    src={avatar}
                                    alt={name}
                                    title={name}
                                    className="w-5 h-5 rounded-full border border-background object-cover ring-1 ring-background"
                                  />
                                ) : (
                                  <div
                                    key={key}
                                    title={name}
                                    className="w-5 h-5 rounded-full bg-secondary text-primary font-bold text-[9px] flex items-center justify-center border border-background ring-1 ring-background"
                                  >
                                    {name.charAt(0).toUpperCase()}
                                  </div>
                                );
                              })}
                              {overflow > 0 && (
                                <div
                                  className="w-5 h-5 rounded-full bg-muted text-muted-foreground font-bold text-[9px] flex items-center justify-center border border-background ring-1 ring-background select-none"
                                  title={`+${overflow} more assignees`}
                                >
                                  +{overflow}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Labels */}
                      {task.labels && task.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 justify-end">
                          {task.labels.slice(0, 2).map((l, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border"
                              style={{
                                backgroundColor: `${l.color}15`,
                                borderColor: `${l.color}40`,
                                color: l.color,
                              }}
                            >
                              {l.name}
                            </span>
                          ))}
                          {task.labels.length > 2 && (
                            <span className="text-[10px] text-muted-foreground font-semibold">
                              +{task.labels.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop & Tablet Table (>= 640px) */}
          <div className="hidden sm:block bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 w-10">Type</th>
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Project</th>
                    <th className="py-3 px-4">List</th>
                    <th className="py-3 px-4">Assignees</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Labels</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTasks.map((task) => {
                    const typeInfo = typeIconConfig[task.taskType] || typeIconConfig.task;
                    const TypeIcon = typeInfo.icon;
                    const formattedDue = formatDate(task.dueDate);
                    const isOverdue =
                      task.dueDate && new Date(task.dueDate) < new Date();

                    return (
                      <tr
                        key={task._id}
                        onClick={() => handleRowClick(task)}
                        className="hover:bg-muted/40 transition-colors cursor-pointer group"
                      >
                        {/* Type Icon */}
                        <td className="py-3 px-4">
                          <div
                            className={`w-6 h-6 rounded-md border flex items-center justify-center ${typeInfo.color}`}
                            title={`Type: ${task.taskType || 'task'}`}
                          >
                            <TypeIcon className="w-3.5 h-3.5" />
                          </div>
                        </td>

                        {/* Title */}
                        <td className="py-3 px-4 font-medium text-foreground group-hover:text-primary transition-colors max-w-xs truncate">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold truncate">
                              {task.title}
                            </span>
                            {task.subitemProgress?.total > 0 && (
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.2 rounded border shrink-0 ${
                                  task.subitemProgress.completed === task.subitemProgress.total
                                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                    : 'text-muted-foreground bg-secondary border-border'
                                }`}
                                title={`Checklist: ${task.subitemProgress.completed}/${task.subitemProgress.total} completed`}
                              >
                                <ListTodo className="w-2.5 h-2.5" />
                                <span>
                                  {task.subitemProgress.completed}/{task.subitemProgress.total}
                                </span>
                              </span>
                            )}
                            {(task.attachmentCount > 0 || task.attachmentsCount > 0) && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.2 rounded border shrink-0 text-muted-foreground bg-secondary border-border"
                                title={`Attachments: ${task.attachmentCount || task.attachmentsCount}`}
                              >
                                <Paperclip className="w-2.5 h-2.5 text-primary" />
                                <span>{task.attachmentCount || task.attachmentsCount}</span>
                              </span>
                            )}
                          </div>
                          {task.description && (
                            <span className="block text-[11px] text-muted-foreground truncate max-w-sm">
                              {task.description}
                            </span>
                          )}
                        </td>

                        {/* Project Badge */}
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary border border-primary/20 truncate max-w-[140px]">
                            <FolderKanban className="w-3 h-3 shrink-0" />
                            <span className="truncate">{task.projectName}</span>
                          </span>
                        </td>

                        {/* List Badge */}
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-secondary text-secondary-foreground border border-border">
                            <ListTodo className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span>{task.listName}</span>
                          </span>
                        </td>

                        {/* Assignees */}
                        <td className="py-3 px-4">
                          {task.assignees && task.assignees.length > 0 ? (() => {
                            const maxVisible = 3;
                            const total = task.assignees.length;
                            const visible = task.assignees.slice(0, maxVisible);
                            const overflow = total - maxVisible;

                            return (
                              <div className="flex items-center -space-x-1.5">
                                {visible.map((a, idx) => {
                                  const isObj = typeof a === 'object' && a !== null;
                                  const idStr = (isObj ? a._id || a.id : a)?.toString();
                                  const resolvedUser = isObj ? a : membersMap?.get?.(idStr);
                                  const name = resolvedUser?.name || (isObj ? a.name : 'User');
                                  const avatar = resolvedUser?.avatarUrl || (isObj ? a.avatarUrl : null);
                                  const key = idStr || idx;
                                  return avatar ? (
                                    <img
                                      key={key}
                                      src={avatar}
                                      alt={name}
                                      title={name}
                                      className="w-5 h-5 rounded-full border border-background object-cover ring-1 ring-background"
                                    />
                                  ) : (
                                    <div
                                      key={key}
                                      title={name}
                                      className="w-5 h-5 rounded-full bg-secondary text-primary font-bold text-[9px] flex items-center justify-center border border-background ring-1 ring-background"
                                    >
                                      {name.charAt(0).toUpperCase()}
                                    </div>
                                  );
                                })}
                                {overflow > 0 && (
                                  <div
                                    className="w-5 h-5 rounded-full bg-muted text-muted-foreground font-bold text-[9px] flex items-center justify-center border border-background ring-1 ring-background select-none"
                                    title={`+${overflow} more assignees`}
                                  >
                                    +{overflow}
                                  </div>
                                )}
                              </div>
                            );
                          })() : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </td>

                        {/* Due Date */}
                        <td className="py-3 px-4">
                          {formattedDue ? (
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                                isOverdue ? 'text-destructive font-semibold' : 'text-foreground'
                              }`}
                            >
                              <Calendar className="w-3 h-3" />
                              {formattedDue}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </td>

                        {/* Labels */}
                        <td className="py-3 px-4">
                          {task.labels && task.labels.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[160px]">
                              {task.labels.map((l, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border"
                                  style={{
                                    backgroundColor: `${l.color}15`,
                                    borderColor: `${l.color}40`,
                                    color: l.color,
                                  }}
                                >
                                  {l.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={activeTask}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setActiveTask(null);
        }}
        currentUserRole={currentUserRole}
        members={workspace?.members || []}
        membersMap={membersMap}
        onTaskUpdated={(updatedTask) => {
          setActiveTask((prev) => (prev?._id === updatedTask._id ? updatedTask : prev));
          setTasks((prev) =>
            prev.map((t) => (t._id === updatedTask._id ? { ...t, ...updatedTask } : t))
          );
        }}
        onTaskDeleted={(deletedTaskId) => {
          setIsDetailOpen(false);
          setActiveTask(null);
          setTasks((prev) => prev.filter((t) => t._id !== deletedTaskId));
        }}
      />
    </div>
  );
};
