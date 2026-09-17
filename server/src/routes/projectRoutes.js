import { Router } from 'express';
import {
  getProjectById,
  deleteProject,
  getProjectActivity,
} from '../controllers/projectController.js';
import { createList } from '../controllers/listController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { entityResolverMiddleware } from '../middleware/entityResolverMiddleware.js';
import { requireOwnershipOrCreator } from '../middleware/ownershipMiddleware.js';
import { validate } from '../middleware/validate.js';
import { createListSchema } from '../validations/kanbanSchemas.js';

const router = Router();

// All project routes require authentication
router.use(authMiddleware);

// GET /api/projects/:projectId/activity (any member of parent workspace — viewer included)
router.get(
  '/:projectId/activity',
  entityResolverMiddleware('project', ['owner', 'editor', 'viewer']),
  getProjectActivity
);

// GET /api/projects/:id (any member of parent workspace — returns project with sorted lists & tasks)
router.get(
  '/:id',
  entityResolverMiddleware('project', ['owner', 'editor', 'viewer']),
  getProjectById
);

// DELETE /api/projects/:id (creator or owner only — cascades to lists and tasks)
router.delete(
  '/:id',
  entityResolverMiddleware('project', ['owner', 'editor']),
  requireOwnershipOrCreator('project'),
  deleteProject
);

// POST /api/projects/:projectId/lists (editor/owner)
router.post(
  '/:projectId/lists',
  entityResolverMiddleware('project', ['owner', 'editor']),
  validate(createListSchema),
  createList
);

export default router;
