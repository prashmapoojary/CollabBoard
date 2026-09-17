import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Calendar,
  Clock,
  Tag,
  CheckSquare,
  Bug,
  BookOpen,
  ListTodo,
  Paperclip,
} from 'lucide-react';
import { formatDueDate } from '../../utils/dateUtils';

export const TaskItem = ({
  task,
  onClick,
  isOverlay = false,
  isDragDisabled = false,
  membersMap = null,
}) => {
  const sortable = isOverlay
    ? null
    : useSortable({
        id: task._id,
        data: {
          type: 'Task',
          task,
        },
        disabled: isDragDisabled,
      });

  const isDragging = sortable?.isDragging;

  const style = sortable
    ? {
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }
    : undefined;

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

  const typeInfo = typeConfig[task.taskType] || typeConfig.task;
  const TypeIcon = typeInfo.icon;

  const priorityConfig = {
    low: {
      label: 'Low',
      dot: 'bg-emerald-500',
      badge: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      border: 'border-l-emerald-500',
    },
    medium: {
      label: 'Medium',
      dot: 'bg-amber-500',
      badge: 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
      border: 'border-l-amber-500',
    },
    high: {
      label: 'High',
      dot: 'bg-orange-500',
      badge: 'text-orange-700 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
      border: 'border-l-orange-500',
    },
    urgent: {
      label: 'Urgent',
      dot: 'bg-destructive',
      badge: 'text-destructive bg-destructive/10 border-destructive/20',
      border: 'border-l-destructive',
    },
  };
  const priorityInfo = priorityConfig[task.priority] || priorityConfig.medium;

  const formattedDueDate = formatDueDate(task.dueDate);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const subitemProgress = task.subitemProgress;

  return (
    <div
      ref={sortable ? sortable.setNodeRef : undefined}
      style={style}
      {...(sortable ? sortable.attributes : {})}
      {...(sortable ? sortable.listeners : {})}
      onClick={() => onClick?.(task)}
      className={`p-3.5 bg-background border border-l-4 ${priorityInfo.border} rounded-xl transition-all select-none space-y-2.5 ${
        isOverlay
          ? 'border-primary/50 shadow-2xl scale-[1.03] rotate-1 ring-2 ring-primary/40 cursor-grabbing'
          : isDragging
          ? 'opacity-25 border-dashed border-primary/50 bg-secondary/20 shadow-none'
          : isDragDisabled
          ? 'border-border shadow-2xs hover:border-primary/50 hover:shadow-xs cursor-pointer group'
          : 'border-border shadow-2xs hover:border-primary/50 hover:shadow-xs cursor-grab active:cursor-grabbing group'
      }`}
    >
      {/* Top row: Type Icon, Priority & Labels */}
      <div className="flex items-center justify-between gap-2 flex-wrap pointer-events-none">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${typeInfo.color}`}
            title={`Type: ${task.taskType || 'task'}`}
          >
            <TypeIcon className="w-3 h-3" />
            <span>{typeInfo.label}</span>
          </span>

          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${priorityInfo.badge}`}
            title={`Priority: ${priorityInfo.label}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${priorityInfo.dot}`} />
            <span>{priorityInfo.label}</span>
          </span>

          {task.labels && task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.labels.map((label, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border"
                  style={{
                    backgroundColor: `${label.color}15`,
                    borderColor: `${label.color}35`,
                    color: label.color,
                  }}
                >
                  <Tag className="w-2.5 h-2.5" />
                  <span>{label.name}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {task._id && (
          <span className="text-[10px] font-mono text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">
            #{task._id.slice(-4).toUpperCase()}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors leading-snug break-words pointer-events-none">
        {task.title}
      </h4>

      {/* Description Snippet if present */}
      {task.description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed pointer-events-none">
          {task.description}
        </p>
      )}

      {/* Bottom row: Due Date & Assignees */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] pointer-events-none">
        {/* Due Date & Subitem Progress */}
        <div className="flex items-center gap-2">
          {formattedDueDate ? (
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'
              }`}
            >
              <Calendar className="w-3 h-3" />
              <span>{formattedDueDate}</span>
            </span>
          ) : (
            <span className="text-muted-foreground/50 text-[10px]">—</span>
          )}

          {/* Subitem Progress Badge */}
          {subitemProgress && subitemProgress.total > 0 && (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${
                subitemProgress.completed === subitemProgress.total
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-muted-foreground bg-secondary border-border'
              }`}
              title={`Subtasks: ${subitemProgress.completed} of ${subitemProgress.total} completed`}
            >
              <ListTodo className="w-3 h-3" />
              <span>
                {subitemProgress.completed}/{subitemProgress.total}
              </span>
            </span>
          )}

          {/* Attachment Count Badge */}
          {(task.attachmentCount > 0 || task.attachmentsCount > 0) && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border text-muted-foreground bg-secondary border-border"
              title={`Attachments: ${task.attachmentCount || task.attachmentsCount}`}
            >
              <Paperclip className="w-3 h-3 text-primary" />
              <span>{task.attachmentCount || task.attachmentsCount}</span>
            </span>
          )}
        </div>

        {/* Assignees */}
        <div>
          {task.assignees && task.assignees.length > 0 ? (() => {
            const maxVisible = 3;
            const total = task.assignees.length;
            const visible = task.assignees.slice(0, maxVisible);
            const overflow = total - maxVisible;

            const allNames = task.assignees
              .map((a) => {
                if (typeof a === 'object' && a !== null) return a.name;
                const m = membersMap?.get?.(a?.toString());
                return m?.name || 'User';
              })
              .join(', ');

            return (
              <div
                className="flex items-center -space-x-1.5"
                title={`Assigned to: ${allNames}`}
              >
                {visible.map((assignee, idx) => {
                  const isObj = typeof assignee === 'object' && assignee !== null;
                  const idStr = (isObj ? assignee._id || assignee.id : assignee)?.toString();
                  const resolvedUser = isObj
                    ? assignee
                    : membersMap?.get?.(idStr) || null;
                  const name = resolvedUser?.name || (isObj ? assignee.name : 'User');
                  const avatar = resolvedUser?.avatarUrl || (isObj ? assignee.avatarUrl : null);
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
                    title={`+${overflow} more (${allNames})`}
                  >
                    +{overflow}
                  </div>
                )}
              </div>
            );
          })() : null}
        </div>
      </div>
    </div>
  );
};
