/**
 * Règles de mot de passe partagées — inscription (auth/register.tsx) et
 * modification (auth/reset-password.tsx), seuls les deux endroits de l'app
 * où un mot de passe est saisi. Centralisé ici pour que les deux écrans
 * restent alignés au lieu de dupliquer la regex.
 */
export const PASSWORD_HINT = 'Mot de passe * (min. 8 caractères, majuscule, chiffre & symbole)';

const SPECIAL_CHAR_RE = /[!@#$%^&*(),.?":{}|<>_\-+=[\]/\\~`;']/;

/** Retourne un message d'erreur en français si le mot de passe ne respecte
 * pas les règles, ou `null` s'il est valide. */
export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'Le mot de passe doit contenir au moins 8 caractères.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Le mot de passe doit contenir au moins une lettre majuscule.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Le mot de passe doit contenir au moins une lettre minuscule.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Le mot de passe doit contenir au moins un chiffre.';
  }
  if (!SPECIAL_CHAR_RE.test(password)) {
    return 'Le mot de passe doit contenir au moins un caractère spécial (ex: @, #, $, %).';
  }
  return null;
}

/**
 * Liste noire statique des domaines d'email jetables les plus courants —
 * même liste côté serveur (trigger `reject_disposable_email` sur
 * `public.users`, migration `add_antifraud_signup_guardrails`) qui confirme
 * ce filtre avant l'insert : le client ne fait que donner un retour rapide,
 * il ne fait jamais foi à lui seul.
 */
export const DISPOSABLE_EMAIL_DOMAINS = [
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.biz',
  'guerrillamail.org', 'guerrillamailblock.com', 'sharklasers.com', '10minutemail.com',
  '10minutemail.net', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'tempmail.com',
  'temp-mail.org', 'throwawaymail.com', 'getnada.com', 'trashmail.com', 'trashmail.net',
  'mailnesia.com', 'fakeinbox.com', 'dispostable.com', 'mintemail.com', 'maildrop.cc',
  'mailcatch.com', 'spamgourmet.com', 'tempinbox.com', 'emailondeck.com', 'jetable.org',
  'mohmal.com', 'burnermail.io', 'mailsac.com', 'discard.email', 'mailnull.com',
  'spam4.me', 'moakt.com', 'tempr.email', 'fakemailgenerator.com', 'mytemp.email',
];

/** true si l'adresse utilise un domaine d'email jetable connu. */
export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1];
  return !!domain && DISPOSABLE_EMAIL_DOMAINS.includes(domain);
}
