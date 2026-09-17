import { Router } from 'express';
import {
  createProject,
  getProjectsByWorkspace,
} from '../controllers/projectController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { workspaceRoleMiddleware } from '../middleware/workspaceRoleMiddleware.js';
import { validate } from '../middleware/validate.js';
import { createProjectSchema } from '../validations/kanbanSchemas.js';

const router = Router({ mergeParams: true });

// All workspace project routes require authentication
router.use(authMiddleware);

// POST /api/workspaces/:workspaceId/projects (editor/owner)
router.post(
  '/',
  workspaceRoleMiddleware(['owner', 'editor']),
  validate(createProjectSchema),
  createProject
);

// GET /api/workspaces/:workspaceId/projects (any workspace member)
router.get(
  '/',
  workspaceRoleMiddleware(['owner', 'editor', 'viewer']),
  getProjectsByWorkspace
);

export default router;
