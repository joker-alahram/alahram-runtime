const PREFIX = '[v2]';

export function logError(context, error) {
  console.error(`${PREFIX} ${context}:`, error);
}
