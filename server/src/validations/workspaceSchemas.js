import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Workspace name is required')
    .max(100, 'Workspace name cannot exceed 100 characters'),
});

export const updateWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Workspace name is required')
    .max(100, 'Workspace name cannot exceed 100 characters'),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  role: z
    .enum(['owner', 'editor', 'viewer'], {
      errorMap: () => ({ message: "Role must be 'owner', 'editor', or 'viewer'" }),
    })
    .default('editor'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'editor', 'viewer'], {
    errorMap: () => ({ message: "Role must be 'owner', 'editor', or 'viewer'" }),
  }),
});
