import { Router } from 'express';
import {
  uploadAttachment,
  getTaskAttachments,
  downloadAttachment,
  deleteAttachment,
} from '../controllers/attachmentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { entityResolverMiddleware } from '../middleware/entityResolverMiddleware.js';
import { uploadSingleAttachment } from '../middleware/uploadMiddleware.js';

// Router for /api/attachments (download & global delete)
const router = Router();
router.use(authMiddleware);

// GET /api/attachments/:id/download
router.get('/:id/download', downloadAttachment);

// DELETE /api/attachments/:id
router.delete('/:id', deleteAttachment);

// Router for task-scoped attachments: /api/tasks/:taskId/attachments
export const taskAttachmentRouter = Router({ mergeParams: true });
taskAttachmentRouter.use(authMiddleware);

// POST /api/tasks/:taskId/attachments (multipart/form-data upload, editor/owner)
taskAttachmentRouter.post(
  '/',
  entityResolverMiddleware('task', ['owner', 'editor']),
  uploadSingleAttachment('file'),
  uploadAttachment
);

// GET /api/tasks/:taskId/attachments (viewer/editor/owner)
taskAttachmentRouter.get(
  '/',
  entityResolverMiddleware('task', ['owner', 'editor', 'viewer']),
  getTaskAttachments
);

// DELETE /api/tasks/:taskId/attachments/:attachmentId
taskAttachmentRouter.delete(
  '/:attachmentId',
  entityResolverMiddleware('task', ['owner', 'editor']),
  deleteAttachment
);

export default router;
