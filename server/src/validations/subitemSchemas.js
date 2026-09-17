import { z } from 'zod';

export const createSubitemSchema = z.object({
  text: z
    .string({
      required_error: 'Subitem text is required',
    })
    .trim()
    .min(1, 'Subitem text cannot be empty')
    .max(300, 'Subitem text cannot exceed 300 characters'),
  order: z.number().int().nonnegative().optional(),
});

export const updateSubitemSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Subitem text cannot be empty')
      .max(300, 'Subitem text cannot exceed 300 characters')
      .optional(),
    completed: z.boolean().optional(),
    order: z.number().int().nonnegative().optional(),
  })
  .refine(
    (data) => data.text !== undefined || data.completed !== undefined || data.order !== undefined,
    {
      message: 'At least one field (text, completed, or order) must be provided to update',
    }
  );
