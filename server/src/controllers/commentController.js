import mongoose from 'mongoose';
import { Comment } from '../models/Comment.js';
import { AppError } from '../middleware/errorHandler.js';
import { logActivity } from '../utils/logActivity.js';
import { broadcastToProject } from '../socket/index.js';

/**
 * POST /api/tasks/:taskId/comments
 * Add a comment to a task (any workspace editor or owner).
 */
export const createComment = async (req, res, next) => {
  try {
    const { text } = req.body;
    const task = req.task;
    const project = req.project;

    const comment = await Comment.create({
      taskId: task._id,
      authorId: req.user._id,
      text,
    });

    await comment.populate('authorId', 'name avatarUrl');

    broadcastToProject(req, project._id, 'comment:created', {
      comment: comment.toJSON(),
      taskId: task._id.toString(),
      projectId: project._id.toString(),
    });

    logActivity({
      workspaceId: project.workspaceId,
      projectId: project._id,
      actorId: req.user._id,
      actionType: 'comment_created',
      targetType: 'comment',
      targetId: comment._id,
      metadata: {
        before: null,
        after: {
          taskId: task._id,
          taskTitle: task.title,
          text: comment.text,
        },
      },
    });

    res.status(201).json({
      success: true,
      comment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tasks/:taskId/comments
 * Fetch comments for a task, oldest-first, paginated (accessible to all members including viewers).
 */
export const getTaskComments = async (req, res, next) => {
  try {
    const taskId = req.task._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 30), 100);
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      Comment.find({ taskId })
        .sort({ createdAt: 1 }) // Oldest first
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'name avatarUrl'),
      Comment.countDocuments({ taskId }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    res.status(200).json({
      success: true,
      comments,
      page,
      limit,
      total,
      totalPages,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/tasks/:taskId/comments/:commentId
 * Delete a comment (strictly author or workspace owner only).
 */
export const deleteComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const task = req.task;
    const project = req.project;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return next(new AppError('Invalid comment ID format.', 400));
    }

    const comment = await Comment.findOne({ _id: commentId, taskId: task._id });
    if (!comment) {
      return next(new AppError('Comment not found.', 404));
    }

    const isAuthor = comment.authorId.toString() === req.user._id.toString();
    const isOwner = req.workspaceRole === 'owner';

    if (!isAuthor && !isOwner) {
      return next(
        new AppError('Only the comment author or the workspace owner can delete this comment.', 403)
      );
    }

    await Comment.findByIdAndDelete(comment._id);

    broadcastToProject(req, project._id, 'comment:deleted', {
      commentId: comment._id.toString(),
      taskId: task._id.toString(),
      projectId: project._id.toString(),
    });

    logActivity({
      workspaceId: project.workspaceId,
      projectId: project._id,
      actorId: req.user._id,
      actionType: 'comment_deleted',
      targetType: 'comment',
      targetId: comment._id,
      metadata: {
        before: {
          taskId: task._id,
          taskTitle: task.title,
          text: comment.text,
        },
        after: null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
