import mongoose from 'mongoose';
import { Subitem } from '../models/Subitem.js';
import { AppError } from '../middleware/errorHandler.js';
import { logActivity } from '../utils/logActivity.js';
import { broadcastToProject } from '../socket/index.js';

const getSubitemProgress = async (taskId) => {
  const [total, completed] = await Promise.all([
    Subitem.countDocuments({ taskId }),
    Subitem.countDocuments({ taskId, completed: true }),
  ]);
  return { total, completed };
};

/**
 * POST /api/tasks/:taskId/subitems
 * Add a checklist subitem to a task (any workspace editor or owner).
 */
export const createSubitem = async (req, res, next) => {
  try {
    const { text, order } = req.body;
    const task = req.task;
    const project = req.project;

    let subitemOrder = order;
    if (typeof subitemOrder !== 'number') {
      subitemOrder = await Subitem.countDocuments({ taskId: task._id });
    }

    const subitem = await Subitem.create({
      taskId: task._id,
      createdBy: req.user._id,
      text,
      order: subitemOrder,
    });

    await subitem.populate('createdBy', 'name avatarUrl');

    const subitemProgress = await getSubitemProgress(task._id);

    broadcastToProject(req, project._id, 'subitem:created', {
      subitem: subitem.toJSON(),
      taskId: task._id.toString(),
      projectId: project._id.toString(),
      subitemProgress,
    });

    logActivity({
      workspaceId: project.workspaceId,
      projectId: project._id,
      actorId: req.user._id,
      actionType: 'subitem_created',
      targetType: 'subitem',
      targetId: subitem._id,
      metadata: {
        before: null,
        after: {
          taskId: task._id,
          taskTitle: task.title,
          text: subitem.text,
          completed: subitem.completed,
        },
      },
    });

    res.status(201).json({
      success: true,
      subitem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tasks/:taskId/subitems
 * Fetch subitems for a task, sorted by order and creation time (any workspace member including viewers).
 */
export const getTaskSubitems = async (req, res, next) => {
  try {
    const taskId = req.task._id;

    const subitems = await Subitem.find({ taskId })
      .sort({ order: 1, createdAt: 1 })
      .populate('createdBy', 'name avatarUrl');

    res.status(200).json({
      success: true,
      count: subitems.length,
      subitems,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/tasks/:taskId/subitems/:subitemId
 * Toggle or update any subitem on a task (collaborative checklist: any editor or owner).
 */
export const updateSubitem = async (req, res, next) => {
  try {
    const { subitemId } = req.params;
    const { text, completed, order } = req.body;
    const task = req.task;
    const project = req.project;

    if (!mongoose.Types.ObjectId.isValid(subitemId)) {
      return next(new AppError('Invalid subitem ID format.', 400));
    }

    const subitem = await Subitem.findOne({ _id: subitemId, taskId: task._id });
    if (!subitem) {
      return next(new AppError('Subitem not found.', 404));
    }

    const beforeState = {
      taskId: task._id,
      taskTitle: task.title,
      text: subitem.text,
      completed: subitem.completed,
      order: subitem.order,
    };

    if (text !== undefined) subitem.text = text;
    if (completed !== undefined) subitem.completed = completed;
    if (order !== undefined) subitem.order = order;

    await subitem.save();
    await subitem.populate('createdBy', 'name avatarUrl');

    const subitemProgress = await getSubitemProgress(task._id);

    broadcastToProject(req, project._id, 'subitem:updated', {
      subitem: subitem.toJSON(),
      taskId: task._id.toString(),
      projectId: project._id.toString(),
      subitemProgress,
    });

    logActivity({
      workspaceId: project.workspaceId,
      projectId: project._id,
      actorId: req.user._id,
      actionType: 'subitem_updated',
      targetType: 'subitem',
      targetId: subitem._id,
      metadata: {
        before: beforeState,
        after: {
          taskId: task._id,
          taskTitle: task.title,
          text: subitem.text,
          completed: subitem.completed,
          order: subitem.order,
        },
      },
    });

    res.status(200).json({
      success: true,
      subitem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/tasks/:taskId/subitems/:subitemId
 * Delete a subitem (strictly creator of the subitem OR workspace owner only).
 */
export const deleteSubitem = async (req, res, next) => {
  try {
    const { subitemId } = req.params;
    const task = req.task;
    const project = req.project;

    if (!mongoose.Types.ObjectId.isValid(subitemId)) {
      return next(new AppError('Invalid subitem ID format.', 400));
    }

    const subitem = await Subitem.findOne({ _id: subitemId, taskId: task._id });
    if (!subitem) {
      return next(new AppError('Subitem not found.', 404));
    }

    const isCreator = subitem.createdBy.toString() === req.user._id.toString();
    const isOwner = req.workspaceRole === 'owner';

    if (!isCreator && !isOwner) {
      return next(
        new AppError('Only the creator of this subitem or the workspace owner can delete it.', 403)
      );
    }

    await Subitem.findByIdAndDelete(subitem._id);

    const subitemProgress = await getSubitemProgress(task._id);

    broadcastToProject(req, project._id, 'subitem:deleted', {
      subitemId: subitem._id.toString(),
      taskId: task._id.toString(),
      projectId: project._id.toString(),
      subitemProgress,
    });

    logActivity({
      workspaceId: project.workspaceId,
      projectId: project._id,
      actorId: req.user._id,
      actionType: 'subitem_deleted',
      targetType: 'subitem',
      targetId: subitem._id,
      metadata: {
        before: {
          taskId: task._id,
          taskTitle: task.title,
          text: subitem.text,
        },
        after: null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Subitem deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
