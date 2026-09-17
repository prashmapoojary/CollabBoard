import mongoose from 'mongoose';
import { Workspace } from '../models/Workspace.js';
import { AppError } from './errorHandler.js';
import { checkWorkspaceRole } from '../utils/roleHelper.js';

/**
 * Middleware factory that resolves a workspace from :id or :workspaceId,
 * checks if the authenticated user is a member, verifies their role against
 * allowedRoles, and attaches req.workspace, req.workspaceRole, and req.currentMember.
 *
 * @param {string[]} [allowedRoles] Optional list of allowed roles ('owner', 'editor', 'viewer')
 */
export const workspaceRoleMiddleware = (allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      const workspaceId = req.params.id || req.params.workspaceId;

      if (!workspaceId) {
        return next(new AppError('Workspace ID parameter is missing.', 400));
      }

      if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
        return next(new AppError('Invalid workspace ID format.', 400));
      }

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        return next(new AppError('Workspace not found.', 404));
      }

      const currentMember = checkWorkspaceRole(workspace, req.user._id, allowedRoles);

      req.workspace = workspace;
      req.workspaceRole = currentMember.role;
      req.currentMember = currentMember;

      next();
    } catch (error) {
      next(error);
    }
  };
};
