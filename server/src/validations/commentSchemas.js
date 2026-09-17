import { z } from 'zod';

export const createCommentSchema = z.object({
  text: z
    .string({ required_error: 'Comment text is required' })
    .trim()
    .min(1, 'Comment text cannot be empty')
    .max(2000, 'Comment text cannot exceed 2000 characters'),
});
