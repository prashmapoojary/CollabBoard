import { z } from 'zod';

export const createLogHourSchema = z.object({
  hours: z
    .number({
      required_error: 'Hours is required',
      invalid_type_error: 'Hours must be a number',
    })
    .min(0.25, 'Hours must be at least 0.25')
    .max(24, 'Hours cannot exceed 24 per entry'),
  date: z.coerce.date({
    required_error: 'Date is required',
    invalid_type_error: 'Invalid date format',
  }),
  note: z
    .string()
    .trim()
    .max(300, 'Note cannot exceed 300 characters')
    .optional()
    .default(''),
});

export const updateLogHourSchema = z
  .object({
    hours: z
      .number({ invalid_type_error: 'Hours must be a number' })
      .min(0.25, 'Hours must be at least 0.25')
      .max(24, 'Hours cannot exceed 24 per entry')
      .optional(),
    date: z.coerce.date({ invalid_type_error: 'Invalid date format' }).optional(),
    note: z
      .string()
      .trim()
      .max(300, 'Note cannot exceed 300 characters')
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field (hours, date, or note) is required to update logged hours'
  );
