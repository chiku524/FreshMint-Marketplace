export function migratePolicy(env: Record<string, string | undefined>): {
  run: boolean;
  reason: string;
};
export const NON_RETRYABLE_PRISMA_CODES: string[];
export function nonRetryableCode(output: string): string | null;