import { List } from '../models/List.js';
import { Task } from '../models/Task.js';
import { broadcastToProject } from '../socket/index.js';
import { logActivity } from '../utils/logActivity.js';

/**
 * POST /api/projects/:projectId/lists
 * Create a new list within the resolved project (editor/owner only).
 */
export const createList = async (req, res, next) => {
  try {
    const { title, order } = req.body;

    const list = await List.create({
      projectId: req.project._id,
      title,
      order,
      createdBy: req.user._id,
    });

    broadcastToProject(req, req.project._id, 'list:created', { list });

    logActivity({
      workspaceId: req.project.workspaceId,
      projectId: req.project._id,
      actorId: req.user._id,
      actionType: 'list_created',
      targetType: 'list',
      targetId: list._id,
      metadata: {
        before: null,
        after: { title: list.title, order: list.order },
      },
    });

    res.status(201).json({
      success: true,
      list,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/lists/:id
 * Update title or order of an existing list (editor/owner only).
 */
export const updateList = async (req, res, next) => {
  try {
    const { title, order } = req.body;

    const beforeState = {
      title: req.list.title,
      order: req.list.order,
    };

    if (title !== undefined) req.list.title = title;
    if (order !== undefined) req.list.order = order;

    await req.list.save();

    broadcastToProject(req, req.project._id, 'list:updated', { list: req.list });

    logActivity({
      workspaceId: req.project.workspaceId,
      projectId: req.project._id,
      actorId: req.user._id,
      actionType: 'list_updated',
      targetType: 'list',
      targetId: req.list._id,
      before: beforeState,
      after: { title: req.list.title, order: req.list.order },
    });

    res.status(200).json({
      success: true,
      list: req.list,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/lists/:id
 * Delete a list and cascade delete all its tasks (editor/owner only).
 */
export const deleteList = async (req, res, next) => {
  try {
    const listId = req.list._id;
    const projectId = req.project._id;

    // Actual deleteMany calls to remove child tasks
    await Task.deleteMany({ listId });
    await List.findByIdAndDelete(listId);

    broadcastToProject(req, projectId, 'list:deleted', {
      listId: listId.toString(),
      projectId: projectId.toString(),
    });

    logActivity({
      workspaceId: req.project.workspaceId,
      projectId,
      actorId: req.user._id,
      actionType: 'list_deleted',
      targetType: 'list',
      targetId: listId,
      metadata: {
        before: { title: req.list.title },
        after: null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'List and all associated tasks deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

