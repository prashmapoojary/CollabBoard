import { Router } from 'express';
import {
  createLogHour,
  getTaskLogHours,
  updateLogHour,
  deleteLogHour,
} from '../controllers/logHourController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { entityResolverMiddleware } from '../middleware/entityResolverMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createLogHourSchema,
  updateLogHourSchema,
} from '../validations/logHourSchemas.js';

const router = Router({ mergeParams: true });

// All log hour routes require authentication
router.use(authMiddleware);

// POST /api/tasks/:taskId/loghours (editor/owner)
router.post(
  '/',
  entityResolverMiddleware('task', ['owner', 'editor']),
  validate(createLogHourSchema),
  createLogHour
);

// GET /api/tasks/:taskId/loghours (owner/editor/viewer)
router.get(
  '/',
  entityResolverMiddleware('task', ['owner', 'editor', 'viewer']),
  getTaskLogHours
);

// PATCH /api/tasks/:taskId/loghours/:logId (author or workspace owner)
router.patch(
  '/:logId',
  entityResolverMiddleware('task', ['owner', 'editor']),
  validate(updateLogHourSchema),
  updateLogHour
);

// DELETE /api/tasks/:taskId/loghours/:logId (author or workspace owner)
router.delete(
  '/:logId',
  entityResolverMiddleware('task', ['owner', 'editor']),
  deleteLogHour
);

export default router;
