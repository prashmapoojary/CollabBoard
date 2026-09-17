import { Router } from 'express';
import { updateList, deleteList } from '../controllers/listController.js';
import { createTask } from '../controllers/taskController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { entityResolverMiddleware } from '../middleware/entityResolverMiddleware.js';
import { requireOwnershipOrCreator } from '../middleware/ownershipMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  updateListSchema,
  createTaskSchema,
} from '../validations/kanbanSchemas.js';

const router = Router();

// All list routes require authentication
router.use(authMiddleware);

// PATCH /api/lists/:id (creator/owner if title changed; any editor/owner if order-only)
router.patch(
  '/:id',
  entityResolverMiddleware('list', ['owner', 'editor']),
  validate(updateListSchema),
  requireOwnershipOrCreator('list'),
  updateList
);

// DELETE /api/lists/:id (creator or owner only — cascades to tasks)
router.delete(
  '/:id',
  entityResolverMiddleware('list', ['owner', 'editor']),
  requireOwnershipOrCreator('list'),
  deleteList
);

// POST /api/lists/:listId/tasks (editor/owner)
router.post(
  '/:listId/tasks',
  entityResolverMiddleware('list', ['owner', 'editor']),
  validate(createTaskSchema),
  createTask
);

export default router;
