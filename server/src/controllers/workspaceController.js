import { Workspace } from '../models/Workspace.js';
import { User } from '../models/User.js';
import { sendWorkspaceInviteEmail } from '../services/emailService.js';
import { AppError } from '../middleware/errorHandler.js';
import { logActivity } from '../utils/logActivity.js';

// POST /api/workspaces (Any authenticated user, becomes owner)
export const createWorkspace = async (req, res, next) => {
  try {
    const { name } = req.body;

    const workspace = await Workspace.create({
      name: name.trim(),
      ownerId: req.user._id,
      members: [
        {
          userId: req.user._id,
          role: 'owner',
          joinedAt: new Date(),
        },
      ],
    });

    const populatedWorkspace = await Workspace.findById(workspace._id)
      .populate('ownerId', 'name email avatarUrl')
      .populate('members.userId', 'name email avatarUrl');

    return res.status(201).json({
      success: true,
      message: 'Workspace created successfully.',
      workspace: populatedWorkspace,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/workspaces (List workspaces the authenticated user is a member of)
export const getMyWorkspaces = async (req, res, next) => {
  try {
    const workspaces = await Workspace.find({ 'members.userId': req.user._id })
      .populate('ownerId', 'name email avatarUrl')
      .populate('members.userId', 'name email avatarUrl')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: workspaces.length,
      workspaces,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/workspaces/:id (Any member can view)
export const getWorkspaceById = async (req, res, next) => {
  try {
    const populatedWorkspace = await Workspace.findById(req.workspace._id)
      .populate('ownerId', 'name email avatarUrl')
      .populate('members.userId', 'name email avatarUrl');

    return res.status(200).json({
      success: true,
      workspace: populatedWorkspace,
      currentUserRole: req.workspaceRole,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/workspaces/:id (Owner only — rename)
export const updateWorkspace = async (req, res, next) => {
  try {
    const { name } = req.body;
    const oldName = req.workspace.name;

    req.workspace.name = name.trim();
    await req.workspace.save();

    logActivity({
      workspaceId: req.workspace._id,
      actorId: req.user._id,
      actionType: 'workspace_renamed',
      targetType: 'workspace',
      targetId: req.workspace._id,
      before: { name: oldName },
      after: { name: req.workspace.name },
    });

    const populatedWorkspace = await Workspace.findById(req.workspace._id)
      .populate('ownerId', 'name email avatarUrl')
      .populate('members.userId', 'name email avatarUrl');

    return res.status(200).json({
      success: true,
      message: 'Workspace renamed successfully.',
      workspace: populatedWorkspace,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/workspaces/:id/invite (Owner only — { email, role })
export const inviteMember = async (req, res, next) => {
  try {
    const { email, role = 'editor' } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Verify user with this email is registered in system (404 if not registered)
    const invitedUser = await User.findOne({ email: normalizedEmail });
    if (!invitedUser) {
      return next(new AppError('No registered account found with this email address.', 404));
    }

    // 2. Check if user is already a member (409 if already a member)
    const alreadyMember = req.workspace.members.some(
      (m) => m.userId.toString() === invitedUser._id.toString()
    );
    if (alreadyMember) {
      return next(new AppError('This user is already a member of this workspace.', 409));
    }

    // 3. Add to members list
    req.workspace.members.push({
      userId: invitedUser._id,
      role,
      joinedAt: new Date(),
    });
    await req.workspace.save();

    logActivity({
      workspaceId: req.workspace._id,
      actorId: req.user._id,
      actionType: 'member_invited',
      targetType: 'member',
      targetId: invitedUser._id,
      metadata: {
        before: null,
        after: { email: invitedUser.email, role },
      },
    });

    // 4. Dispatch invitation email in background (non-blocking fire-and-forget)
    sendWorkspaceInviteEmail(
      invitedUser.email,
      req.user.name,
      req.workspace.name,
      role
    ).catch((mailErr) => {
      console.error('[Email Warning] Workspace invite email failed to dispatch:', mailErr.message);
    });

    const populatedWorkspace = await Workspace.findById(req.workspace._id)
      .populate('ownerId', 'name email avatarUrl')
      .populate('members.userId', 'name email avatarUrl');

    return res.status(200).json({
      success: true,
      message: `Invitation sent to ${invitedUser.email} as ${role}.`,
      workspace: populatedWorkspace,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/workspaces/:id/members/:userId (Owner only — change role)
export const updateMemberRole = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    const targetMember = req.workspace.members.find(
      (m) => m.userId.toString() === userId.toString()
    );

    if (!targetMember) {
      return next(new AppError('Member not found in this workspace.', 404));
    }

    // Protect last owner from being demoted
    if (targetMember.role === 'owner' && role !== 'owner') {
      const ownerCount = req.workspace.members.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        return next(
          new AppError('Cannot demote the only owner. Assign another owner before demoting.', 400)
        );
      }
    }

    const oldRole = targetMember.role;
    targetMember.role = role;
    await req.workspace.save();

    logActivity({
      workspaceId: req.workspace._id,
      actorId: req.user._id,
      actionType: 'member_role_changed',
      targetType: 'member',
      targetId: targetMember.userId,
      before: { role: oldRole },
      after: { role: targetMember.role },
    });

    const populatedWorkspace = await Workspace.findById(req.workspace._id)
      .populate('ownerId', 'name email avatarUrl')
      .populate('members.userId', 'name email avatarUrl');

    return res.status(200).json({
      success: true,
      message: 'Member role updated successfully.',
      workspace: populatedWorkspace,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/workspaces/:id/members/:userId (Owner only — remove member)
export const removeMember = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const targetMember = req.workspace.members.find(
      (m) => m.userId.toString() === userId.toString()
    );

    if (!targetMember) {
      return next(new AppError('Member not found in this workspace.', 404));
    }

    // Protect last owner from being removed
    if (targetMember.role === 'owner') {
      const ownerCount = req.workspace.members.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        return next(
          new AppError('Cannot remove the only owner. Transfer ownership or assign another owner first.', 400)
        );
      }
    }

    const removedRole = targetMember.role;
    req.workspace.members = req.workspace.members.filter(
      (m) => m.userId.toString() !== userId.toString()
    );
    await req.workspace.save();

    logActivity({
      workspaceId: req.workspace._id,
      actorId: req.user._id,
      actionType: 'member_removed',
      targetType: 'member',
      targetId: targetMember.userId,
      metadata: {
        before: { role: removedRole },
        after: null,
      },
    });

    const populatedWorkspace = await Workspace.findById(req.workspace._id)
      .populate('ownerId', 'name email avatarUrl')
      .populate('members.userId', 'name email avatarUrl');

    return res.status(200).json({
      success: true,
      message: 'Member removed from workspace.',
      workspace: populatedWorkspace,
    });
  } catch (error) {
    next(error);
  }
};
