export function logServerError(scope: string, error: unknown) {
  console.error(`[${scope}]`, error);
}

