import { z } from 'zod';

const SUPPORTED_LANGUAGES = ['python', 'javascript'] as const;
const EXECUTION_MODES = ['repl', 'batch'] as const;

export const executeSchema = z.object({
  language: z.enum(SUPPORTED_LANGUAGES, {
    errorMap: () => ({ message: `Language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}` }),
  }),
  code: z
    .string()
    .min(1, 'Code cannot be empty')
    .max(100_000, 'Code exceeds maximum length of 100,000 characters'),
  mode: z.enum(EXECUTION_MODES, {
    errorMap: () => ({ message: `Mode must be one of: ${EXECUTION_MODES.join(', ')}` }),
  }),
});

export type ExecuteInput = z.infer<typeof executeSchema>;
