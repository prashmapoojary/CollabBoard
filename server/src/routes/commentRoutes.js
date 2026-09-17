import { Router } from 'express';
import {
  createComment,
  getTaskComments,
  deleteComment,
} from '../controllers/commentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { entityResolverMiddleware } from '../middleware/entityResolverMiddleware.js';
import { validate } from '../middleware/validate.js';
import { createCommentSchema } from '../validations/commentSchemas.js';

const router = Router({ mergeParams: true });

// All comment routes require authentication
router.use(authMiddleware);

// POST /api/tasks/:taskId/comments (editor/owner)
router.post(
  '/',
  entityResolverMiddleware('task', ['owner', 'editor']),
  validate(createCommentSchema),
  createComment
);

// GET /api/tasks/:taskId/comments (owner/editor/viewer)
router.get(
  '/',
  entityResolverMiddleware('task', ['owner', 'editor', 'viewer']),
  getTaskComments
);

// DELETE /api/tasks/:taskId/comments/:commentId (author or workspace owner)
router.delete(
  '/:commentId',
  entityResolverMiddleware('task', ['owner', 'editor']),
  deleteComment
);

export default router;
