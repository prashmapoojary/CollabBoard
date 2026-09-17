/**
 * Centralized formatting utilities for Activity Log entries.
 */

/**
 * Formats a Date object or ISO string into a concise relative timestamp.
 * Examples: "just now", "5m ago", "2h ago", "3d ago", "2w ago"
 *
 * @param {string|Date} dateInput
 * @returns {string}
 */
export const formatRelativeTime = (dateInput) => {
  if (!dateInput) return '';

  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffInSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

  if (diffInSeconds < 45) {
    return 'just now';
  }

  const minutes = Math.floor(diffInSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 4) {
    return `${weeks}w ago`;
  }

  // Fallback to short date format for older items: e.g. "Sep 16"
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Formats an ActivityLog entry into structured text parts.
 *
 * @param {Object} activity - The ActivityLog document
 * @param {Map<string, string>|Object} [listsMap] - Optional map of listId -> listTitle
 * @returns {{ actorName: string, actionText: string, targetName: string, extraText: string }}
 */
export const formatActivityParts = (activity, listsMap = {}) => {
  if (!activity) {
    return { actorName: 'Someone', actionText: 'performed an action', targetName: '', extraText: '' };
  }

  // Resolve actor name
  const actor = activity.actor || activity.actorId;
  const actorName =
    typeof actor === 'object' && actor?.name
      ? actor.name
      : typeof activity.actorName === 'string'
      ? activity.actorName
      : 'Someone';

  const { actionType, metadata = {} } = activity;
  const before = metadata?.before || {};
  const after = metadata?.after || {};

  const getListTitle = (lid) => {
    if (!lid) return 'a list';
    const idStr = lid.toString();
    if (listsMap instanceof Map) {
      return listsMap.get(idStr) || 'a list';
    }
    return listsMap[idStr] || 'a list';
  };

  switch (actionType) {
    // ---------------- TASK ACTIONS ----------------
    case 'task_created': {
      const title = after?.title || 'a task';
      const listTitle = after?.listId ? getListTitle(after.listId) : null;
      return {
        actorName,
        actionText: 'created task',
        targetName: `"${title}"`,
        extraText: listTitle ? `in ${listTitle}` : '',
      };
    }

    case 'task_updated': {
      if (before?.title && after?.title && before.title !== after.title) {
        return {
          actorName,
          actionText: 'renamed task',
          targetName: `"${before.title}"`,
          extraText: `to "${after.title}"`,
        };
      }
      const title = after?.title || before?.title || 'a task';
      if (after?.priority && before?.priority !== after?.priority) {
        const capitalized = after.priority.charAt(0).toUpperCase() + after.priority.slice(1);
        return {
          actorName,
          actionText: 'changed priority of',
          targetName: `"${title}"`,
          extraText: `to ${capitalized}`,
        };
      }
      return {
        actorName,
        actionText: 'updated task',
        targetName: `"${title}"`,
        extraText: '',
      };
    }

    case 'task_moved': {
      const explicitTitle = after?.title || before?.title;
      const targetList = after?.listId ? getListTitle(after.listId) : null;
      return {
        actorName,
        actionText: 'moved',
        targetName: explicitTitle ? `task "${explicitTitle}"` : 'a task',
        extraText: targetList ? `to ${targetList}` : '',
      };
    }

    case 'task_deleted': {
      const title = before?.title || 'a task';
      return {
        actorName,
        actionText: 'deleted task',
        targetName: `"${title}"`,
        extraText: '',
      };
    }

    // ---------------- LIST ACTIONS ----------------
    case 'list_created': {
      const title = after?.title || 'a list';
      return {
        actorName,
        actionText: 'created list',
        targetName: `"${title}"`,
        extraText: '',
      };
    }

    case 'list_updated': {
      if (before?.title && after?.title && before.title !== after.title) {
        return {
          actorName,
          actionText: 'renamed list',
          targetName: `"${before.title}"`,
          extraText: `to "${after.title}"`,
        };
      }
      const title = after?.title || before?.title || 'a list';
      return {
        actorName,
        actionText: 'updated list',
        targetName: `"${title}"`,
        extraText: '',
      };
    }

    case 'list_deleted': {
      const title = before?.title || 'a list';
      return {
        actorName,
        actionText: 'deleted list',
        targetName: `"${title}"`,
        extraText: '',
      };
    }

    // ---------------- PROJECT ACTIONS ----------------
    case 'project_created': {
      const title = after?.title || 'a project';
      return {
        actorName,
        actionText: 'created project',
        targetName: `"${title}"`,
        extraText: '',
      };
    }

    case 'project_deleted': {
      const title = before?.title || 'a project';
      return {
        actorName,
        actionText: 'deleted project',
        targetName: `"${title}"`,
        extraText: '',
      };
    }

    // ---------------- WORKSPACE ACTIONS ----------------
    case 'workspace_renamed': {
      const name = after?.name || 'the workspace';
      return {
        actorName,
        actionText: 'renamed the workspace to',
        targetName: `"${name}"`,
        extraText: '',
      };
    }

    // ---------------- MEMBER ACTIONS ----------------
    case 'member_invited': {
      const email = after?.email || 'a new member';
      const role = after?.role || 'member';
      return {
        actorName,
        actionText: 'invited',
        targetName: email,
        extraText: `as ${role}`,
      };
    }

    case 'member_role_changed': {
      const role = after?.role || 'member';
      return {
        actorName,
        actionText: 'changed member role to',
        targetName: role,
        extraText: '',
      };
    }

    case 'member_removed': {
      return {
        actorName,
        actionText: 'removed a member from the workspace',
        targetName: '',
        extraText: '',
      };
    }

    // ---------------- COMMENT ACTIONS ----------------
    case 'comment_created': {
      const taskTitle = after?.taskTitle || 'a task';
      return {
        actorName,
        actionText: 'commented on task',
        targetName: `"${taskTitle}"`,
        extraText: '',
      };
    }

    // ---------------- SUBITEM ACTIONS ----------------
    case 'subitem_created': {
      const taskTitle = after?.taskTitle || 'a task';
      const text = after?.text || 'a subtask';
      return {
        actorName,
        actionText: 'added checklist item',
        targetName: `"${text}"`,
        extraText: `to task "${taskTitle}"`,
      };
    }

    case 'subitem_updated': {
      const taskTitle = after?.taskTitle || before?.taskTitle || 'a task';
      const text = after?.text || before?.text || 'a subtask';
      const wasCompleted = before?.completed;
      const isCompleted = after?.completed;

      let actionDesc = 'updated checklist item';
      if (wasCompleted === false && isCompleted === true) {
        actionDesc = 'completed checklist item';
      } else if (wasCompleted === true && isCompleted === false) {
        actionDesc = 'reopened checklist item';
      }

      return {
        actorName,
        actionText: actionDesc,
        targetName: `"${text}"`,
        extraText: `on "${taskTitle}"`,
      };
    }

    case 'subitem_deleted': {
      const taskTitle = before?.taskTitle || 'a task';
      const text = before?.text || 'a subtask';
      return {
        actorName,
        actionText: 'deleted checklist item',
        targetName: `"${text}"`,
        extraText: `from "${taskTitle}"`,
      };
    }

    // ---------------- ATTACHMENT ACTIONS ----------------
    case 'attachment_created': {
      const taskTitle = after?.taskTitle || 'a task';
      const filename = after?.filename || 'a file';
      return {
        actorName,
        actionText: 'attached file',
        targetName: `"${filename}"`,
        extraText: `to task "${taskTitle}"`,
      };
    }

    case 'attachment_deleted': {
      const taskTitle = before?.taskTitle || 'a task';
      const filename = before?.filename || 'a file';
      return {
        actorName,
        actionText: 'deleted attachment',
        targetName: `"${filename}"`,
        extraText: `from task "${taskTitle}"`,
      };
    }

    // ---------------- LOG HOUR ACTIONS ----------------
    case 'loghour_created': {
      const taskTitle = after?.taskTitle || 'a task';
      const hours = after?.hours ?? 0;
      return {
        actorName,
        actionText: `logged ${hours}h on`,
        targetName: `task "${taskTitle}"`,
        extraText: '',
      };
    }

    case 'loghour_updated': {
      const taskTitle = after?.taskTitle || before?.taskTitle || 'a task';
      const newHours = after?.hours;
      const oldHours = before?.hours;
      const hoursNote =
        newHours !== undefined && oldHours !== undefined && newHours !== oldHours
          ? ` (${oldHours}h -> ${newHours}h)`
          : '';
      return {
        actorName,
        actionText: 'updated logged hours',
        targetName: `on "${taskTitle}"${hoursNote}`,
        extraText: '',
      };
    }

    case 'loghour_deleted': {
      const taskTitle = before?.taskTitle || 'a task';
      const hours = before?.hours ? ` (${before.hours}h)` : '';
      return {
        actorName,
        actionText: 'deleted time log',
        targetName: `from "${taskTitle}"${hours}`,
        extraText: '',
      };
    }

    default: {
      const cleanAction = (actionType || 'action').replace(/_/g, ' ');
      return {
        actorName,
        actionText: cleanAction,
        targetName: '',
        extraText: '',
      };
    }
  }
};

/**
 * Formats an ActivityLog entry into a single complete sentence string.
 */
export const formatActivitySentence = (activity, listsMap = {}) => {
  const { actorName, actionText, targetName, extraText } = formatActivityParts(activity, listsMap);
  const parts = [actorName, actionText, targetName, extraText].filter(Boolean);
  return parts.join(' ');
};

/**
 * Returns contextual styling tokens and icon category for an actionType.
 */
export const getActivityCategory = (actionType = '') => {
  if (actionType.startsWith('task_created') || actionType.startsWith('list_created') || actionType.startsWith('project_created')) {
    return {
      type: 'create',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      dotClass: 'bg-emerald-500',
    };
  }

  if (actionType.includes('moved')) {
    return {
      type: 'move',
      badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
      dotClass: 'bg-indigo-500',
    };
  }

  if (actionType.includes('deleted') || actionType.includes('removed')) {
    return {
      type: 'delete',
      badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      dotClass: 'bg-rose-500',
    };
  }

  if (actionType.includes('invited') || actionType.includes('role')) {
    return {
      type: 'member',
      badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      dotClass: 'bg-amber-500',
    };
  }

  if (actionType.startsWith('comment_')) {
    return {
      type: 'comment',
      badgeClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
      dotClass: 'bg-sky-500',
    };
  }

  if (actionType.startsWith('subitem_')) {
    return {
      type: 'subitem',
      badgeClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
      dotClass: 'bg-teal-500',
    };
  }

  if (actionType.startsWith('attachment_')) {
    return {
      type: 'attachment',
      badgeClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
      dotClass: 'bg-violet-500',
    };
  }

  if (actionType.startsWith('loghour_')) {
    return {
      type: 'loghour',
      badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      dotClass: 'bg-amber-500',
    };
  }

  return {
    type: 'update',
    badgeClass: 'bg-primary/10 text-primary border-primary/20',
    dotClass: 'bg-primary',
  };
};
