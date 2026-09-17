import { Router } from 'express';
import {
  createSubitem,
  getTaskSubitems,
  updateSubitem,
  deleteSubitem,
} from '../controllers/subitemController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { entityResolverMiddleware } from '../middleware/entityResolverMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createSubitemSchema,
  updateSubitemSchema,
} from '../validations/subitemSchemas.js';

const router = Router({ mergeParams: true });

// All subitem routes require authentication
router.use(authMiddleware);

// POST /api/tasks/:taskId/subitems (editor/owner — viewers 403)
router.post(
  '/',
  entityResolverMiddleware('task', ['owner', 'editor']),
  validate(createSubitemSchema),
  createSubitem
);

// GET /api/tasks/:taskId/subitems (owner/editor/viewer)
router.get(
  '/',
  entityResolverMiddleware('task', ['owner', 'editor', 'viewer']),
  getTaskSubitems
);

// PATCH /api/tasks/:taskId/subitems/:subitemId (collaborative toggle/edit: any editor or owner)
router.patch(
  '/:subitemId',
  entityResolverMiddleware('task', ['owner', 'editor']),
  validate(updateSubitemSchema),
  updateSubitem
);

// DELETE /api/tasks/:taskId/subitems/:subitemId (creator or workspace owner only)
router.delete(
  '/:subitemId',
  entityResolverMiddleware('task', ['owner', 'editor']),
  deleteSubitem
);

export default router;
