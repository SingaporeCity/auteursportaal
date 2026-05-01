/**
 * Re-exports voor de auth-module.
 *
 * @module auth
 */

export { decideAccess, type AuthorRow, type AccessDecision, type AccessRole } from './whitelist';
export {
  restoreSession,
  getActiveSession,
  loadOwnProfile,
  signOut,
  onAuthStateChange,
} from './session';
export {
  signInWithPassword,
  requestPasswordReset,
  setNewPassword,
  PASSWORD_MIN_LENGTH,
} from './password';
export { signInWithAzure, isAdminSsoEnabled } from './sso';
