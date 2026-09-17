import { AppError } from '../middleware/errorHandler.js';

/**
 * Validates whether the given user is a member of the workspace and holds
 * one of the allowed roles.
 *
 * @param {Object} workspace - Workspace document with members array
 * @param {string|import('mongoose').Types.ObjectId} userId - Authenticated user's ID
 * @param {string[]} [allowedRoles] - Optional list of allowed roles ('owner', 'editor', 'viewer')
 * @returns {Object} The current member entry from workspace.members
 * @throws {AppError} 404 if workspace missing, 403 if non-member or insufficient permissions
 */
export const checkWorkspaceRole = (workspace, userId, allowedRoles = []) => {
  if (!workspace) {
    throw new AppError('Workspace not found.', 404);
  }

  const currentMember = workspace.members.find(
    (m) => m.userId.toString() === userId.toString()
  );

  if (!currentMember) {
    throw new AppError('Access denied. You are not a member of this workspace.', 403);
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(currentMember.role)) {
    throw new AppError(
      `Access denied. This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
      403
    );
  }

  return currentMember;
};
