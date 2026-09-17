import { Router } from 'express';
import {
  updateTask,
  moveTask,
  deleteTask,
} from '../controllers/taskController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { entityResolverMiddleware } from '../middleware/entityResolverMiddleware.js';
import { requireOwnershipOrCreator } from '../middleware/ownershipMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  updateTaskSchema,
  moveTaskSchema,
} from '../validations/kanbanSchemas.js';
import commentRoutes from './commentRoutes.js';
import subitemRoutes from './subitemRoutes.js';
import { taskAttachmentRouter } from './attachmentRoutes.js';

const router = Router();

// All task routes require authentication
router.use(authMiddleware);

// Sub-routes for task comments, subitems, and attachments
router.use('/:taskId/comments', commentRoutes);
router.use('/:taskId/subitems', subitemRoutes);
router.use('/:taskId/attachments', taskAttachmentRouter);

// PATCH /api/tasks/:id/move (editor/owner — body: { listId, order } — NO ownership check required)
router.patch(
  '/:id/move',
  entityResolverMiddleware('task', ['owner', 'editor']),
  validate(moveTaskSchema),
  moveTask
);

// PATCH /api/tasks/:id (creator, owner, or assignee)
router.patch(
  '/:id',
  entityResolverMiddleware('task', ['owner', 'editor']),
  validate(updateTaskSchema),
  requireOwnershipOrCreator('task', { allowAssignee: true }),
  updateTask
);

// DELETE /api/tasks/:id (creator or owner only — NOT assignees)
router.delete(
  '/:id',
  entityResolverMiddleware('task', ['owner', 'editor']),
  requireOwnershipOrCreator('task', { allowAssignee: false }),
  deleteTask
);

export default router;
