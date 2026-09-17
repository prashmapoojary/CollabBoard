import { AppError } from './errorHandler.js';

/**
 * Middleware factory that enforces ownership-based edit & delete permissions,
 * layered on top of the workspaceRoleMiddleware / entityResolverMiddleware.
 *
 * Rules:
 * 1. The workspace OWNER can always edit/delete anything, regardless of who created it.
 * 2. The CREATOR of a Project/List/Task can always edit/delete their own creation.
 * 3. For Tasks specifically (content edit): any CURRENT ASSIGNEE can edit content (allowAssignee = true),
 *    but assignees CANNOT delete the task (allowAssignee = false).
 * 4. Anyone else who holds an editor role generally, but is neither creator/owner/assignee
 *    for this specific item, is blocked with 403.
 * 5. This rule does NOT apply to:
 *    - PATCH /api/tasks/:id/move (drag/move)
 *    - PATCH /api/lists/:id when only reordering (body has 'order' but NOT 'title').
 *      If both title and order are in the body, ownership check applies.
 *
 * @param {'project'|'list'|'task'} resourceType - Target entity type
 * @param {Object} [options]
 * @param {boolean} [options.allowAssignee=false] - Whether current assignees can edit (tasks only)
 */
export const requireOwnershipOrCreator = (resourceType, options = {}) => {
  return (req, res, next) => {
    try {
      // 1. Workspace OWNER can always edit/delete anything
      if (req.workspaceRole === 'owner') {
        return next();
      }

      // 2. Exception: For list PATCH, if only reordering (title is undefined), allow any editor
      if (
        resourceType === 'list' &&
        req.method === 'PATCH' &&
        req.body?.title === undefined
      ) {
        return next();
      }

      // 3. Resolve target entity from request context
      let resource;
      if (resourceType === 'project') resource = req.project;
      else if (resourceType === 'list') resource = req.list;
      else if (resourceType === 'task') resource = req.task;

      if (!resource) {
        return next(
          new AppError(
            `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} not found.`,
            404
          )
        );
      }

      const userId = (req.user?.id || req.user?._id)?.toString();

      // 4. CREATOR of the resource can always edit/delete it
      const creatorId = (resource.createdBy?._id || resource.createdBy)?.toString();
      if (creatorId && creatorId === userId) {
        return next();
      }

      // 5. For Tasks specifically: CURRENT ASSIGNEES can edit content (not delete)
      const allowAssignee =
        options.allowAssignee !== undefined
          ? options.allowAssignee
          : (resourceType === 'task' && req.method !== 'DELETE');

      if (resourceType === 'task' && allowAssignee) {
        const isAssignee =
          Array.isArray(resource.assignees) &&
          resource.assignees.some(
            (assignee) =>
              (assignee?._id ? assignee._id.toString() : assignee?.toString()) ===
              userId
          );

        if (isAssignee) {
          return next();
        }
      }

      // 6. Otherwise 403 with clear message as specified
      return next(
        new AppError(
          'Only the creator, an assignee, or the workspace owner can edit this',
          403
        )
      );
    } catch (error) {
      next(error);
    }
  };
};
