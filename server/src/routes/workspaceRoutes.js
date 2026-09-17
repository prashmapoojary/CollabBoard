import { Router } from 'express';
import {
  createWorkspace,
  getMyWorkspaces,
  getWorkspaceById,
  updateWorkspace,
  inviteMember,
  updateMemberRole,
  removeMember,
} from '../controllers/workspaceController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { workspaceRoleMiddleware } from '../middleware/workspaceRoleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
} from '../validations/workspaceSchemas.js';

const router = Router();

// All workspace routes require an authenticated user session
router.use(authMiddleware);

// Workspace creation & listing
router.post('/', validate(createWorkspaceSchema), createWorkspace);
router.get('/', getMyWorkspaces);

// Workspace details & owner rename
router.get('/:id', workspaceRoleMiddleware(['owner', 'editor', 'viewer']), getWorkspaceById);
router.patch('/:id', workspaceRoleMiddleware(['owner']), validate(updateWorkspaceSchema), updateWorkspace);

// Member management (Owner only)
router.post(
  '/:id/invite',
  workspaceRoleMiddleware(['owner']),
  validate(inviteMemberSchema),
  inviteMember
);
router.patch(
  '/:id/members/:userId',
  workspaceRoleMiddleware(['owner']),
  validate(updateMemberRoleSchema),
  updateMemberRole
);
router.delete(
  '/:id/members/:userId',
  workspaceRoleMiddleware(['owner']),
  removeMember
);

export default router;
