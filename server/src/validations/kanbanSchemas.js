import { z } from 'zod';

export const createProjectSchema = z.object({
  title: z
    .string({ required_error: 'Project title is required' })
    .trim()
    .min(1, 'Project title cannot be empty')
    .max(100, 'Project title cannot exceed 100 characters'),
});

export const createListSchema = z.object({
  title: z
    .string({ required_error: 'List title is required' })
    .trim()
    .min(1, 'List title cannot be empty')
    .max(100, 'List title cannot exceed 100 characters'),
  order: z.number({
    required_error: 'Order must be a number',
    invalid_type_error: 'Order must be a number',
  }),
});

export const updateListSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'List title cannot be empty')
      .max(100, 'List title cannot exceed 100 characters')
      .optional(),
    order: z
      .number({ invalid_type_error: 'Order must be a number' })
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field (title or order) is required to update list'
  );

export const labelSchema = z.object({
  name: z
    .string({ required_error: 'Label name is required' })
    .trim()
    .min(1, 'Label name cannot be empty')
    .max(50, 'Label name cannot exceed 50 characters'),
  color: z
    .string({ required_error: 'Label color is required' })
    .trim()
    .regex(
      /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
      'Label color must be a valid hex color code (e.g. #ff0000 or #f00)'
    ),
});

export const createTaskSchema = z.object({
  title: z
    .string({ required_error: 'Task title is required' })
    .trim()
    .min(1, 'Task title cannot be empty')
    .max(255, 'Task title cannot exceed 255 characters'),
  description: z.string().trim().max(5000, 'Description cannot exceed 5000 characters').optional().default(''),
  order: z.number({
    required_error: 'Order must be a number',
    invalid_type_error: 'Order must be a number',
  }),
  taskType: z
    .enum(['task', 'bug', 'story'], {
      invalid_type_error: 'Task type must be one of: task, bug, story',
    })
    .optional()
    .default('task'),
  priority: z
    .enum(['low', 'medium', 'high', 'urgent'], {
      invalid_type_error: 'Priority must be one of: low, medium, high, urgent',
    })
    .optional()
    .default('medium'),
  dueDate: z.coerce.date().nullable().optional(),
  assignees: z
    .array(
      z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid assignee ID format')
    )
    .optional()
    .default([]),
  labels: z.array(labelSchema).optional().default([]),
});

export const updateTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Task title cannot be empty')
      .max(255, 'Task title cannot exceed 255 characters')
      .optional(),
    description: z.string().trim().max(5000, 'Description cannot exceed 5000 characters').optional(),
    order: z
      .number({ invalid_type_error: 'Order must be a number' })
      .optional(),
    taskType: z
      .enum(['task', 'bug', 'story'], {
        invalid_type_error: 'Task type must be one of: task, bug, story',
      })
      .optional(),
    priority: z
      .enum(['low', 'medium', 'high', 'urgent'], {
        invalid_type_error: 'Priority must be one of: low, medium, high, urgent',
      })
      .optional(),
    dueDate: z.coerce.date().nullable().optional(),
    assignees: z
      .array(
        z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid assignee ID format')
      )
      .optional(),
    labels: z.array(labelSchema).optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field is required to update task'
  );

export const moveTaskSchema = z.object({
  listId: z
    .string({ required_error: 'listId is required' })
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid target list ID format'),
  order: z.number({
    required_error: 'Order must be a number',
    invalid_type_error: 'Order must be a number',
  }),
});
