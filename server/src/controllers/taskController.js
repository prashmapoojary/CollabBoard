import { Task } from '../models/Task.js';
import { List } from '../models/List.js';
import { AppError } from '../middleware/errorHandler.js';
import { broadcastToProject } from '../socket/index.js';
import { logActivity } from '../utils/logActivity.js';

/**
 * POST /api/lists/:listId/tasks
 * Create a new task within the resolved list & project (editor/owner only).
 */
export const createTask = async (req, res, next) => {
  try {
    const {
      title,
      description,
      order,
      taskType,
      dueDate,
      assignees,
      labels,
    } = req.body;

    const task = await Task.create({
      listId: req.list._id,
      projectId: req.project._id,
      title,
      description: description !== undefined ? description : '',
      order,
      taskType: taskType || 'task',
      dueDate: dueDate || null,
      assignees: assignees || [],
      labels: labels || [],
      createdBy: req.user._id,
    });

    broadcastToProject(req, req.project._id, 'task:created', { task });

    logActivity({
      workspaceId: req.project.workspaceId,
      projectId: req.project._id,
      actorId: req.user._id,
      actionType: 'task_created',
      targetType: 'task',
      targetId: task._id,
      metadata: {
        before: null,
        after: {
          title: task.title,
          description: task.description,
          order: task.order,
          taskType: task.taskType,
          dueDate: task.dueDate,
          assignees: task.assignees,
          labels: task.labels,
          listId: task.listId,
        },
      },
    });

    res.status(201).json({
      success: true,
      task,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/tasks/:id
 * Update an existing task's fields (editor/owner only).
 */
export const updateTask = async (req, res, next) => {
  try {
    const {
      title,
      description,
      order,
      taskType,
      dueDate,
      assignees,
      labels,
    } = req.body;

    const beforeState = {
      title: req.task.title,
      description: req.task.description,
      order: req.task.order,
      taskType: req.task.taskType,
      dueDate: req.task.dueDate,
      assignees: req.task.assignees,
      labels: req.task.labels,
    };

    if (title !== undefined) req.task.title = title;
    if (description !== undefined) req.task.description = description;
    if (order !== undefined) req.task.order = order;
    if (taskType !== undefined) req.task.taskType = taskType;
    if (dueDate !== undefined) req.task.dueDate = dueDate;
    if (assignees !== undefined) req.task.assignees = assignees;
    if (labels !== undefined) req.task.labels = labels;

    await req.task.save();

    broadcastToProject(req, req.project._id, 'task:updated', { task: req.task });

    logActivity({
      workspaceId: req.project.workspaceId,
      projectId: req.project._id,
      actorId: req.user._id,
      actionType: 'task_updated',
      targetType: 'task',
      targetId: req.task._id,
      before: beforeState,
      after: {
        title: req.task.title,
        description: req.task.description,
        order: req.task.order,
        taskType: req.task.taskType,
        dueDate: req.task.dueDate,
        assignees: req.task.assignees,
        labels: req.task.labels,
      },
    });

    res.status(200).json({
      success: true,
      task: req.task,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/tasks/:id/move
 * Move task to a list and update its order index (editor/owner only).
 * Validates that the target list exists and belongs to the same project.
 */
export const moveTask = async (req, res, next) => {
  try {
    const { listId, order } = req.body;
    const task = req.task;

    const beforeState = {
      listId: task.listId,
      order: task.order,
    };

    // Check if moving to a different list
    if (listId && listId.toString() !== task.listId.toString()) {
      const targetList = await List.findById(listId);
      if (!targetList) {
        return next(new AppError('Target list not found.', 404));
      }

      // Enforce project boundary: target list must belong to the same project
      if (targetList.projectId.toString() !== task.projectId.toString()) {
        return next(
          new AppError('Cannot move task to a list on a different project.', 400)
        );
      }

      task.listId = targetList._id;
    }

    task.order = order;
    await task.save();

    broadcastToProject(req, req.project._id, 'task:moved', { task });

    logActivity({
      workspaceId: req.project.workspaceId,
      projectId: req.project._id,
      actorId: req.user._id,
      actionType: 'task_moved',
      targetType: 'task',
      targetId: task._id,
      before: beforeState,
      after: {
        listId: task.listId,
        order: task.order,
      },
    });

    res.status(200).json({
      success: true,
      task,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/tasks/:id
 * Delete a task (editor/owner only).
 */
export const deleteTask = async (req, res, next) => {
  try {
    const taskId = req.task._id;
    const listId = req.task.listId;
    const projectId = req.project._id;

    await Task.findByIdAndDelete(taskId);

    broadcastToProject(req, projectId, 'task:deleted', {
      taskId: taskId.toString(),
      listId: listId.toString(),
      projectId: projectId.toString(),
    });

    logActivity({
      workspaceId: req.project.workspaceId,
      projectId,
      actorId: req.user._id,
      actionType: 'task_deleted',
      targetType: 'task',
      targetId: taskId,
      metadata: {
        before: {
          title: req.task.title,
          listId: req.task.listId,
        },
        after: null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

