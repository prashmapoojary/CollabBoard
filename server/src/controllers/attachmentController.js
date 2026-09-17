import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { Attachment } from '../models/Attachment.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Workspace } from '../models/Workspace.js';
import { AppError } from '../middleware/errorHandler.js';
import { checkWorkspaceRole } from '../utils/roleHelper.js';
import { logActivity } from '../utils/logActivity.js';
import { broadcastToProject } from '../socket/index.js';
import { UPLOADS_DIR } from '../middleware/uploadMiddleware.js';

/**
 * POST /api/tasks/:taskId/attachments
 * Upload a file attachment to a task (editor or owner).
 */
export const uploadAttachment = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('Please select a file to upload.', 400));
    }

    const task = req.task;
    const project = req.project;

    const attachment = await Attachment.create({
      taskId: task._id,
      uploadedBy: req.user._id,
      filename: req.file.originalname,
      storedFilename: req.file.filename,
      mimeType: req.file.mimetype || 'application/octet-stream',
      sizeBytes: req.file.size,
    });

    await attachment.populate('uploadedBy', 'name email avatarUrl');

    broadcastToProject(req, project._id, 'attachment:created', {
      attachment: attachment.toJSON(),
      taskId: task._id.toString(),
      projectId: project._id.toString(),
    });

    logActivity({
      workspaceId: project.workspaceId,
      projectId: project._id,
      actorId: req.user._id,
      actionType: 'attachment_created',
      targetType: 'attachment',
      targetId: attachment._id,
      metadata: {
        before: null,
        after: {
          taskId: task._id,
          taskTitle: task.title,
          filename: attachment.filename,
          sizeBytes: attachment.sizeBytes,
        },
      },
    });

    res.status(201).json({
      success: true,
      attachment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tasks/:taskId/attachments
 * List all attachments for a task (any workspace member including viewers).
 */
export const getTaskAttachments = async (req, res, next) => {
  try {
    const taskId = req.task._id;

    const attachments = await Attachment.find({ taskId })
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'name email avatarUrl');

    res.status(200).json({
      success: true,
      count: attachments.length,
      attachments,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper to resolve attachment and its ancestor hierarchy (task, project, workspace)
 * and verify membership for attachment actions.
 */
const resolveAttachmentContext = async (attachmentId, userId, allowedRoles = []) => {
  if (!mongoose.Types.ObjectId.isValid(attachmentId)) {
    throw new AppError('Invalid attachment ID format.', 400);
  }

  const attachment = await Attachment.findById(attachmentId);
  if (!attachment) {
    throw new AppError('Attachment not found.', 404);
  }

  const task = await Task.findById(attachment.taskId);
  if (!task) {
    throw new AppError('Parent task not found.', 404);
  }

  const project = await Project.findById(task.projectId);
  if (!project) {
    throw new AppError('Parent project not found.', 404);
  }

  const workspace = await Workspace.findById(project.workspaceId);
  if (!workspace) {
    throw new AppError('Parent workspace not found.', 404);
  }

  const currentMember = checkWorkspaceRole(workspace, userId, allowedRoles);

  return {
    attachment,
    task,
    project,
    workspace,
    currentMember,
    role: currentMember.role,
  };
};

/**
 * GET /api/attachments/:id/download
 * Download/stream file attachment (accessible to any workspace member with access to parent task).
 */
export const downloadAttachment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { attachment } = await resolveAttachmentContext(
      id,
      req.user._id,
      ['owner', 'editor', 'viewer']
    );

    const filePath = path.join(UPLOADS_DIR, attachment.storedFilename);

    if (!fs.existsSync(filePath)) {
      return next(new AppError('File not found on server disk.', 404));
    }

    // Set headers and stream the file
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.download(filePath, attachment.filename, (err) => {
      if (err && !res.headersSent) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/attachments/:id
 * Delete an attachment (strictly uploader of the attachment OR workspace owner only).
 * Removes both the database record and the file from disk.
 */
export const deleteAttachment = async (req, res, next) => {
  try {
    const id = req.params.id || req.params.attachmentId;

    const { attachment, task, project, role } = await resolveAttachmentContext(
      id,
      req.user._id,
      ['owner', 'editor']
    );

    const isUploader = attachment.uploadedBy.toString() === req.user._id.toString();
    const isOwner = role === 'owner';

    if (!isUploader && !isOwner) {
      return next(
        new AppError('Only the uploader or the workspace owner can delete this attachment.', 403)
      );
    }

    // 1. Delete file from disk
    const filePath = path.join(UPLOADS_DIR, attachment.storedFilename);
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (diskErr) {
      console.error('[Attachment] Error deleting file from disk:', diskErr);
    }

    // 2. Delete database record
    await Attachment.findByIdAndDelete(attachment._id);

    // 3. Socket broadcast
    broadcastToProject(req, project._id, 'attachment:deleted', {
      attachmentId: attachment._id.toString(),
      taskId: task._id.toString(),
      projectId: project._id.toString(),
    });

    // 4. Activity log
    logActivity({
      workspaceId: project.workspaceId,
      projectId: project._id,
      actorId: req.user._id,
      actionType: 'attachment_deleted',
      targetType: 'attachment',
      targetId: attachment._id,
      metadata: {
        before: {
          taskId: task._id,
          taskTitle: task.title,
          filename: attachment.filename,
        },
        after: null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Attachment deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
