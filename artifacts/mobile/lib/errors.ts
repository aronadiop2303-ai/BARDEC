/**
 * Never show a raw Supabase/Postgres error to the end user — it can leak
 * schema details (table/column/constraint names, RLS policy internals) and
 * is rarely actionable copy for someone who isn't a developer. Log the real
 * detail (console only, stripped in production release builds by Metro's
 * dead-code elimination when __DEV__ is false — kept here regardless since
 * it's still useful in a debug/dev-client build) and return a safe generic
 * message to display instead.
 */
export function toUserMessage(
  context: string,
  error: unknown,
  fallback = 'Une erreur est survenue. Réessaie dans un instant.',
): string {
  console.error(`[${context}]`, error);
  return fallback;
}

/**
 * Auth (login/register) errors are a special case: Supabase GoTrue's own
 * messages ("Invalid login credentials", "User already registered") are
 * already generic/actionable and safe to show — unlike raw Postgres errors
 * from inserting into our own tables, which can leak column/constraint
 * names. Map the known-safe GoTrue phrases to French copy; anything else
 * (including any Postgres-level error) falls back to a generic message.
 */
const KNOWN_AUTH_ERRORS: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Email ou mot de passe incorrect.'],
  [/email not confirmed/i, 'Merci de confirmer ton email avant de te connecter.'],
  [/user already registered/i, 'Un compte existe déjà avec cet email.'],
  [/password should be at least/i, 'Le mot de passe est trop court.'],
  [/rate limit/i, 'Trop de tentatives. Réessaie dans quelques minutes.'],
];

export function toAuthMessage(context: string, error: unknown): string {
  console.error(`[${context}]`, error);
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  for (const [pattern, safeMessage] of KNOWN_AUTH_ERRORS) {
    if (pattern.test(raw)) return safeMessage;
  }
  return 'Une erreur est survenue. Réessaie dans un instant.';
}
