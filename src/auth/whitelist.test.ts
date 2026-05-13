import { describe, it, expect } from 'vitest';
import { decideAccess, type AuthorRow } from './whitelist';

const baseAuthor: AuthorRow = {
  id: '00000000-0000-0000-0000-000000000001',
  netsuite_vendor_id: 'V00000001',
  netsuite_internal_id: null,
  alliant_id: null,
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  initials: null,
  bsn: null,
  birth_date: null,
  phone: null,
  street: null,
  house_number: null,
  postcode: null,
  city: null,
  country: 'Nederland',
  bank_account: null,
  bic: null,
  is_admin: false,
  is_active: false,
  onboarding_status: 'pending_data',
  invited_at: null,
  data_submitted_at: null,
  reminder_sent_at: null,
  last_exported_at: null,
  must_change_password: false,
  password_changed_at: null,
  mfa_enrolled: false,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  activated_at: null,
};

describe('decideAccess', () => {
  it('weigert toegang als er geen profiel is', () => {
    const result = decideAccess(null);
    expect(result).toEqual({ granted: false, reason: 'no_profile' });
  });

  it('verleent onboarding-toegang aan auteur in pending_data', () => {
    const author = { ...baseAuthor, onboarding_status: 'pending_data' as const };
    const result = decideAccess(author);
    expect(result).toEqual({ granted: true, role: 'author', mode: 'onboarding', author });
  });

  it('verleent onboarding-toegang aan auteur in pending_admin_review', () => {
    const author = { ...baseAuthor, onboarding_status: 'pending_admin_review' as const };
    const result = decideAccess(author);
    expect(result).toEqual({ granted: true, role: 'author', mode: 'onboarding', author });
  });

  it('verleent volledige toegang aan auteur in active', () => {
    const author = {
      ...baseAuthor,
      onboarding_status: 'active' as const,
      is_active: true,
    };
    const result = decideAccess(author);
    expect(result).toEqual({ granted: true, role: 'author', mode: 'full', author });
  });

  it('verleent volledige toegang aan admin (ook bij niet-actieve onboarding)', () => {
    const author = {
      ...baseAuthor,
      is_admin: true,
      onboarding_status: 'pending_data' as const,
    };
    const result = decideAccess(author);
    expect(result).toEqual({ granted: true, role: 'admin', mode: 'full', author });
  });

  it('admin-rol wint van auteur-rol bij beide flags actief', () => {
    const author = {
      ...baseAuthor,
      is_admin: true,
      onboarding_status: 'active' as const,
      is_active: true,
    };
    const result = decideAccess(author);
    expect(result.granted).toBe(true);
    if (result.granted) {
      expect(result.role).toBe('admin');
      expect(result.mode).toBe('full');
    }
  });
});
