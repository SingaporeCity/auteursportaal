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
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  activated_at: null,
};

describe('decideAccess', () => {
  it('weigert toegang als er geen profiel is', () => {
    const result = decideAccess(null);
    expect(result).toEqual({ granted: false, reason: 'no_profile' });
  });

  it('weigert toegang aan niet-geactiveerde auteur', () => {
    const result = decideAccess({ ...baseAuthor, is_admin: false, is_active: false });
    expect(result).toEqual({ granted: false, reason: 'not_active' });
  });

  it('verleent toegang aan geactiveerde auteur', () => {
    const author = { ...baseAuthor, is_admin: false, is_active: true };
    const result = decideAccess(author);
    expect(result).toEqual({ granted: true, role: 'author', author });
  });

  it('verleent toegang aan admin (ook als is_active false is)', () => {
    const author = { ...baseAuthor, is_admin: true, is_active: false };
    const result = decideAccess(author);
    expect(result).toEqual({ granted: true, role: 'admin', author });
  });

  it('admin-rol wint van auteur-rol bij beide flags actief', () => {
    const author = { ...baseAuthor, is_admin: true, is_active: true };
    const result = decideAccess(author);
    expect(result.granted).toBe(true);
    if (result.granted) {
      expect(result.role).toBe('admin');
    }
  });
});
