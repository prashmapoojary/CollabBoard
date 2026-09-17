import { LogHour } from '../models/LogHour.js';
import { AppError } from '../middleware/errorHandler.js';
import { broadcastToProject } from '../socket/index.js';
import { logActivity } from '../utils/logActivity.js';

/**
 * POST /api/tasks/:taskId/loghours
 * Log work hours against a task.
 * Any workspace editor/owner can log time. User identity is set from auth token.
 */
export const createLogHour = async (req, res, next) => {
  try {
    const { hours, date, note } = req.body;
    const taskId = req.task._id;
    const projectId = req.project._id;

    // Strict anti-spoofing: userId is always taken from authenticated session
    const logHour = await LogHour.create({
      taskId,
      userId: req.user._id,
      hours,
      date: date ? new Date(date) : new Date(),
      note: note !== undefined ? note : '',
    });

    await logHour.populate('user', '_id name email avatarUrl');

    broadcastToProject(req, projectId, 'loghour:created', {
      logHour,
      taskId: taskId.toString(),
    });

    logActivity({
      workspaceId: req.project.workspaceId,
      projectId,
      actorId: req.user._id,
      actionType: 'loghour_created',
      targetType: 'loghour',
      targetId: logHour._id,
      metadata: {
        before: null,
        after: {
          taskId,
          taskTitle: req.task.title,
          hours: logHour.hours,
          date: logHour.date,
          note: logHour.note,
        },
      },
    });

    res.status(201).json({
      success: true,
      logHour,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tasks/:taskId/loghours
 * Retrieve all logged hours for a task, sorted most-recent-date-first, plus computed total.
 * Available to all workspace members (owner, editor, viewer).
 */
export const getTaskLogHours = async (req, res, next) => {
  try {
    const taskId = req.task._id;

    const logHours = await LogHour.find({ taskId })
      .sort({ date: -1, createdAt: -1 })
      .populate('user', '_id name email avatarUrl');

    const totalHoursRaw = logHours.reduce((acc, entry) => acc + (Number(entry.hours) || 0), 0);
    const totalHours = Math.round(totalHoursRaw * 100) / 100;

    res.status(200).json({
      success: true,
      logHours,
      totalHours,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/tasks/:taskId/loghours/:logId
 * Update an existing log hour entry.
 * Restricted to entry's author OR workspace owner only.
 */
export const updateLogHour = async (req, res, next) => {
  try {
    const { logId } = req.params;
    const { hours, date, note } = req.body;
    const taskId = req.task._id;
    const projectId = req.project._id;

    const logHour = await LogHour.findOne({ _id: logId, taskId });
    if (!logHour) {
      return next(new AppError('Logged hours entry not found.', 404));
    }

    // Permission guard: author or workspace owner only
    const isAuthor = logHour.userId.toString() === req.user._id.toString();
    const isWorkspaceOwner = req.workspaceRole === 'owner';

    if (!isAuthor && !isWorkspaceOwner) {
      return next(
        new AppError('Only the author or workspace owner can edit this logged hours entry.', 403)
      );
    }

    const beforeState = {
      hours: logHour.hours,
      date: logHour.date,
      note: logHour.note,
      taskTitle: req.task.title,
    };

    if (hours !== undefined) logHour.hours = hours;
    if (date !== undefined) logHour.date = new Date(date);
    if (note !== undefined) logHour.note = note;

    await logHour.save();
    await logHour.populate('user', '_id name email avatarUrl');

    broadcastToProject(req, projectId, 'loghour:updated', {
      logHour,
      taskId: taskId.toString(),
    });

    logActivity({
      workspaceId: req.project.workspaceId,
      projectId,
      actorId: req.user._id,
      actionType: 'loghour_updated',
      targetType: 'loghour',
      targetId: logHour._id,
      before: beforeState,
      after: {
        hours: logHour.hours,
        date: logHour.date,
        note: logHour.note,
        taskTitle: req.task.title,
      },
    });

    res.status(200).json({
      success: true,
      logHour,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/tasks/:taskId/loghours/:logId
 * Delete an existing log hour entry.
 * Restricted to entry's author OR workspace owner only.
 */
export const deleteLogHour = async (req, res, next) => {
  try {
    const { logId } = req.params;
    const taskId = req.task._id;
    const projectId = req.project._id;

    const logHour = await LogHour.findOne({ _id: logId, taskId });
    if (!logHour) {
      return next(new AppError('Logged hours entry not found.', 404));
    }

    // Permission guard: author or workspace owner only
    const isAuthor = logHour.userId.toString() === req.user._id.toString();
    const isWorkspaceOwner = req.workspaceRole === 'owner';

    if (!isAuthor && !isWorkspaceOwner) {
      return next(
        new AppError('Only the author or workspace owner can delete this logged hours entry.', 403)
      );
    }

    await LogHour.findByIdAndDelete(logId);

    broadcastToProject(req, projectId, 'loghour:deleted', {
      logHourId: logId.toString(),
      taskId: taskId.toString(),
    });

    logActivity({
      workspaceId: req.project.workspaceId,
      projectId,
      actorId: req.user._id,
      actionType: 'loghour_deleted',
      targetType: 'loghour',
      targetId: logId,
      metadata: {
        before: {
          taskId,
          taskTitle: req.task.title,
          hours: logHour.hours,
          date: logHour.date,
        },
        after: null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Logged hours entry deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};
