import React from 'react';
import {
  formatRelativeTime,
  formatActivityParts,
  getActivityCategory,
} from '../../utils/formatActivity';
import {
  CheckSquare,
  ArrowRight,
  Edit3,
  Trash2,
  FolderKanban,
  ListTodo,
  UserPlus,
  Users,
  Shield,
  Clock,
} from 'lucide-react';

const renderActionIcon = (actionType = '') => {
  if (actionType === 'task_created') return <CheckSquare className="w-3.5 h-3.5" />;
  if (actionType === 'task_moved') return <ArrowRight className="w-3.5 h-3.5" />;
  if (actionType === 'task_deleted') return <Trash2 className="w-3.5 h-3.5" />;
  if (actionType === 'task_updated') return <Edit3 className="w-3.5 h-3.5" />;
  if (actionType.startsWith('list_')) return <ListTodo className="w-3.5 h-3.5" />;
  if (actionType.startsWith('project_')) return <FolderKanban className="w-3.5 h-3.5" />;
  if (actionType === 'member_invited') return <UserPlus className="w-3.5 h-3.5" />;
  if (actionType === 'member_role_changed') return <Shield className="w-3.5 h-3.5" />;
  if (actionType === 'member_removed') return <Users className="w-3.5 h-3.5" />;
  return <Clock className="w-3.5 h-3.5" />;
};

export const ActivityItem = ({ activity, listsMap = {} }) => {
  if (!activity) return null;

  const actor = activity.actor || activity.actorId;
  const actorName =
    typeof actor === 'object' && actor?.name
      ? actor.name
      : typeof activity.actorName === 'string'
      ? activity.actorName
      : 'Someone';

  const avatarUrl = typeof actor === 'object' ? actor?.avatarUrl : null;
  const initial = (actorName || 'U').charAt(0).toUpperCase();

  const { actionText, targetName, extraText } = formatActivityParts(activity, listsMap);
  const timeAgo = formatRelativeTime(activity.createdAt);
  const category = getActivityCategory(activity.actionType);

  return (
    <div className="group relative flex items-start gap-3 p-3.5 rounded-xl transition-all duration-150 hover:bg-muted/40 border border-transparent hover:border-border/60">
      {/* Actor Avatar / Initial */}
      <div className="relative shrink-0 mt-0.5">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={actorName}
            className="w-8 h-8 rounded-full object-cover border border-border"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center border border-primary/20">
            {initial}
          </div>
        )}
        {/* Contextual Action Icon Dot */}
        <div
          className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border border-card shadow-xs ${category.badgeClass}`}
          title={activity.actionType}
        >
          {renderActionIcon(activity.actionType)}
        </div>
      </div>

      {/* Content Text & Metadata */}
      <div className="flex-1 min-w-0 pr-1">
        <p className="text-xs leading-relaxed text-muted-foreground break-words">
          <span className="font-semibold text-foreground">{actorName}</span>{' '}
          <span>{actionText}</span>{' '}
          {targetName && (
            <span className="font-medium text-foreground">{targetName}</span>
          )}{' '}
          {extraText && <span>{extraText}</span>}
        </p>

        {/* Relative Timestamp */}
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground/80">
          <Clock className="w-3 h-3 text-muted-foreground/60" />
          <span>{timeAgo}</span>
        </div>
      </div>
    </div>
  );
};
