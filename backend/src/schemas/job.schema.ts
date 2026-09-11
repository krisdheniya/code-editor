import { z } from 'zod';

export const jobIdParamSchema = z.object({
  id: z.string().uuid('Invalid job ID format'),
});

export const jobQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type JobIdParam = z.infer<typeof jobIdParamSchema>;
export type JobQuery = z.infer<typeof jobQuerySchema>;
