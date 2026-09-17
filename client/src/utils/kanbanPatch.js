/**
 * Immutable state patch helpers for Kanban board real-time updates.
 */

/**
 * Inserts or updates a created task in the project state.
 */
export const applyTaskCreated = (project, newTask) => {
  if (!project || !newTask || !newTask._id) return project;

  const targetListId = (newTask.listId?._id || newTask.listId)?.toString();

  const updatedLists = (project.lists || []).map((list) => {
    const listId = list._id?.toString();
    if (listId === targetListId) {
      // Check if task already exists (e.g. already added optimistically)
      const existingIndex = (list.tasks || []).findIndex(
        (t) => t._id?.toString() === newTask._id?.toString()
      );

      let newTasks;
      if (existingIndex >= 0) {
        newTasks = [...list.tasks];
        newTasks[existingIndex] = { ...newTasks[existingIndex], ...newTask };
      } else {
        newTasks = [...(list.tasks || []), newTask];
      }

      // Sort tasks by order ascending
      newTasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return { ...list, tasks: newTasks };
    }
    return list;
  });

  return { ...project, lists: updatedLists };
};

/**
 * Updates an existing task's properties across all lists.
 * Also handles list transfer if listId was changed in the update payload.
 */
export const applyTaskUpdated = (project, updatedTask) => {
  if (!project || !updatedTask || !updatedTask._id) return project;

  const taskId = updatedTask._id?.toString();
  const targetListId = (updatedTask.listId?._id || updatedTask.listId)?.toString();

  // Check if the task moved between lists
  let currentListId = null;
  let existingTask = null;

  for (const list of project.lists || []) {
    const found = list.tasks?.find((t) => t._id?.toString() === taskId);
    if (found) {
      currentListId = list._id?.toString();
      existingTask = found;
      break;
    }
  }

  // If task was not found anywhere, it could be newly assigned to this project
  if (!currentListId) {
    if (targetListId) {
      return applyTaskCreated(project, updatedTask);
    }
    return project;
  }

  // If task stayed in the same list
  if (!targetListId || currentListId === targetListId) {
    const updatedLists = (project.lists || []).map((list) => {
      if (list._id?.toString() === currentListId) {
        const tasks = (list.tasks || []).map((t) =>
          t._id?.toString() === taskId ? { ...t, ...updatedTask } : t
        );
        return { ...list, tasks };
      }
      return list;
    });
    return { ...project, lists: updatedLists };
  }

  // If task changed listId during update
  const mergedTask = { ...existingTask, ...updatedTask, listId: targetListId };
  const updatedLists = (project.lists || []).map((list) => {
    const listId = list._id?.toString();
    if (listId === currentListId) {
      return {
        ...list,
        tasks: (list.tasks || []).filter((t) => t._id?.toString() !== taskId),
      };
    }
    if (listId === targetListId) {
      const tasks = [...(list.tasks || []), mergedTask].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
      return { ...list, tasks };
    }
    return list;
  });

  return { ...project, lists: updatedLists };
};

/**
 * Handles real-time task:moved event. Moves task to target list at specified order.
 */
export const applyTaskMoved = (project, movedTask) => {
  if (!project || !movedTask || !movedTask._id) return project;

  const taskId = movedTask._id?.toString();
  const targetListId = (movedTask.listId?._id || movedTask.listId)?.toString();
  const newOrder = typeof movedTask.order === 'number' ? movedTask.order : 0;

  // Find and extract existing task
  let taskData = { ...movedTask };
  for (const list of project.lists || []) {
    const found = list.tasks?.find((t) => t._id?.toString() === taskId);
    if (found) {
      taskData = { ...found, ...movedTask };
      break;
    }
  }

  taskData.listId = targetListId;
  taskData.order = newOrder;

  // Remove task from all lists first
  const cleanedLists = (project.lists || []).map((list) => ({
    ...list,
    tasks: (list.tasks || []).filter((t) => t._id?.toString() !== taskId),
  }));

  // Insert into target list at specified order
  const updatedLists = cleanedLists.map((list) => {
    if (list._id?.toString() === targetListId) {
      const tasks = [...(list.tasks || [])];
      const insertIndex = Math.min(Math.max(0, newOrder), tasks.length);
      tasks.splice(insertIndex, 0, taskData);

      // Normalize orders
      const normalizedTasks = tasks.map((t, idx) => ({ ...t, order: idx }));
      return { ...list, tasks: normalizedTasks };
    }
    return list;
  });

  return { ...project, lists: updatedLists };
};

/**
 * Deletes a task by ID across all lists.
 */
export const applyTaskDeleted = (project, deletedTaskId) => {
  if (!project || !deletedTaskId) return project;

  const taskId = deletedTaskId.toString();
  const updatedLists = (project.lists || []).map((list) => ({
    ...list,
    tasks: (list.tasks || []).filter((t) => t._id?.toString() !== taskId),
  }));

  return { ...project, lists: updatedLists };
};

/**
 * Adds a new list to project state.
 */
export const applyListCreated = (project, newList) => {
  if (!project || !newList || !newList._id) return project;

  const exists = (project.lists || []).some(
    (l) => l._id?.toString() === newList._id?.toString()
  );
  if (exists) return project;

  const lists = [...(project.lists || []), { ...newList, tasks: newList.tasks || [] }];
  lists.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return { ...project, lists };
};

/**
 * Updates list attributes (e.g. title) without overwriting its tasks.
 */
export const applyListUpdated = (project, updatedList) => {
  if (!project || !updatedList || !updatedList._id) return project;

  const updatedLists = (project.lists || []).map((list) => {
    if (list._id?.toString() === updatedList._id?.toString()) {
      return {
        ...list,
        ...updatedList,
        tasks: list.tasks, // Preserve existing task array
      };
    }
    return list;
  });

  return { ...project, lists: updatedLists };
};

/**
 * Removes a list from project state.
 */
export const applyListDeleted = (project, deletedListId) => {
  if (!project || !deletedListId) return project;

  const listId = deletedListId.toString();
  const updatedLists = (project.lists || []).filter(
    (l) => l._id?.toString() !== listId
  );

  return { ...project, lists: updatedLists };
};
