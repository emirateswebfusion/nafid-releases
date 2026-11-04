/** Narrowing helpers for restaurant IPC payloads (inputs arrive as `unknown`). */

export type Input = Record<string, unknown>;

export class RestaurantInputError extends Error {}

export function asInput(value: unknown): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RestaurantInputError('Invalid request');
  return value as Input;
}

export function text(input: Input, key: string, required = false): string | null {
  const value = input[key];
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    if (required) throw new RestaurantInputError(`${key} is required`);
    return null;
  }
  if (typeof value !== 'string' && typeof value !== 'number') throw new RestaurantInputError(`${key} must be text`);
  return String(value).trim();
}

export function requiredText(input: Input, key: string): string {
  return text(input, key, true) as string;
}

export function number(input: Input, key: string, fallback: number, min = -Infinity): number {
  const value = input[key];
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) throw new RestaurantInputError(`${key} must be a number${min > -Infinity ? ` ≥ ${min}` : ''}`);
  return n;
}

export function flag(input: Input, key: string, fallback: boolean): boolean {
  const value = input[key];
  if (value == null) return fallback;
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function textList(input: Input, key: string): string[] {
  const value = input[key];
  if (value == null) return [];
  if (!Array.isArray(value)) throw new RestaurantInputError(`${key} must be a list`);
  return value.filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .map(v => String(v).trim()).filter(Boolean);
}

export function list(input: Input, key: string): Input[] {
  const value = input[key];
  if (value == null) return [];
  if (!Array.isArray(value)) throw new RestaurantInputError(`${key} must be a list`);
  return value.map(asInput);
}

export function parseJsonList(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseTextList(value: string | null | undefined): string[] {
  return parseJsonList(value).filter((v): v is string => typeof v === 'string');
}

/** Converts a thrown error into the `{ success: false, error }` shape; unexpected errors are logged, not shown. */
export function failure(scope: string, error: unknown): { success: false; error: string } {
  if (error instanceof RestaurantInputError) return { success: false, error: error.message };
  console.error(`[restaurant:${scope}]`, error);
  return { success: false, error: 'Operation failed' };
}
