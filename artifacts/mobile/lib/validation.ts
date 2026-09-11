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
