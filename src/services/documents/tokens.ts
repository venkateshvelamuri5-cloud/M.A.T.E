/**
 * Rough token estimate. English averages ~4 characters per token; 3.5 errs high for safety.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
