import mongoose from 'mongoose';
import { Project } from '../models/Project.js';
import { List } from '../models/List.js';
import { Task } from '../models/Task.js';
import { Workspace } from '../models/Workspace.js';
import { AppError } from './errorHandler.js';
import { checkWorkspaceRole } from '../utils/roleHelper.js';

/**
 * Middleware factory that resolves a nested Kanban entity (Project, List, or Task),
 * traces its ownership up to the root Workspace, and verifies that the authenticated user
 * has the required role in that Workspace using the shared checkWorkspaceRole helper.
 *
 * @param {'project'|'list'|'task'} entityType - Entity to resolve from req.params
 * @param {string[]} [allowedRoles] - Roles allowed to access the endpoint ('owner', 'editor', 'viewer')
 */
export const entityResolverMiddleware = (entityType, allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      let entityId;
      if (entityType === 'project') {
        entityId = req.params.id || req.params.projectId;
      } else if (entityType === 'list') {
        entityId = req.params.id || req.params.listId;
      } else if (entityType === 'task') {
        entityId = req.params.id || req.params.taskId;
      }

      if (!entityId) {
        return next(new AppError(`${entityType.charAt(0).toUpperCase() + entityType.slice(1)} ID parameter is missing.`, 400));
      }

      if (!mongoose.Types.ObjectId.isValid(entityId)) {
        return next(new AppError(`Invalid ${entityType} ID format.`, 400));
      }

      let project = null;
      let list = null;
      let task = null;

      if (entityType === 'project') {
        project = await Project.findById(entityId);
        if (!project) {
          return next(new AppError('Project not found.', 404));
        }
      } else if (entityType === 'list') {
        list = await List.findById(entityId);
        if (!list) {
          return next(new AppError('List not found.', 404));
        }
        project = await Project.findById(list.projectId);
        if (!project) {
          return next(new AppError('Parent project not found.', 404));
        }
      } else if (entityType === 'task') {
        task = await Task.findById(entityId);
        if (!task) {
          return next(new AppError('Task not found.', 404));
        }
        project = await Project.findById(task.projectId);
        if (!project) {
          return next(new AppError('Parent project not found.', 404));
        }
      }

      const workspace = await Workspace.findById(project.workspaceId);
      if (!workspace) {
        return next(new AppError('Parent workspace not found.', 404));
      }

      // Check workspace membership and role using the shared helper
      const currentMember = checkWorkspaceRole(workspace, req.user._id, allowedRoles);

      // Attach resolved entities to request context
      req.workspace = workspace;
      req.workspaceRole = currentMember.role;
      req.currentMember = currentMember;
      req.project = project;
      if (list) req.list = list;
      if (task) req.task = task;

      next();
    } catch (error) {
      next(error);
    }
  };
};
