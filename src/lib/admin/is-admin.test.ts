import { describe, it, expect } from 'vitest';
import { isAdminUser, parseAdminUserIds, adminUserCount } from './is-admin';

describe('parseAdminUserIds', () => {
  it('returns empty Set for null/undefined/empty', () => {
    expect(parseAdminUserIds(null).size).toBe(0);
    expect(parseAdminUserIds(undefined).size).toBe(0);
    expect(parseAdminUserIds('').size).toBe(0);
    expect(parseAdminUserIds('   ').size).toBe(0);
  });

  it('parses comma-separated ids', () => {
    const set = parseAdminUserIds('user_a,user_b,user_c');
    expect(set.size).toBe(3);
    expect(set.has('user_a')).toBe(true);
    expect(set.has('user_b')).toBe(true);
    expect(set.has('user_c')).toBe(true);
  });

  it('trims whitespace and drops empty entries', () => {
    const set = parseAdminUserIds('  user_a , user_b ,, ,user_c  ');
    expect(set.size).toBe(3);
    expect(set.has('user_a')).toBe(true);
  });

  it('strips surrounding double quotes (Vercel paste artefact)', () => {
    const set = parseAdminUserIds('"user_a,user_b"');
    expect(set.size).toBe(2);
  });

  it('strips surrounding single quotes', () => {
    const set = parseAdminUserIds("'user_a,user_b'");
    expect(set.size).toBe(2);
  });

  it('does NOT strip mismatched quotes', () => {
    const set = parseAdminUserIds(`"user_a,user_b'`);
    // Mismatched quotes are NOT stripped, so the literal `"user_a` is one entry.
    expect(set.has('"user_a')).toBe(true);
  });

  it('dedupes by Set semantics', () => {
    const set = parseAdminUserIds('user_a,user_a,user_a');
    expect(set.size).toBe(1);
  });
});

describe('isAdminUser', () => {
  it('returns false for null/undefined clerkUserId regardless of allowlist', () => {
    expect(isAdminUser(null, 'user_a')).toBe(false);
    expect(isAdminUser(undefined, 'user_a')).toBe(false);
  });

  it('returns false when allowlist is empty', () => {
    expect(isAdminUser('user_a', '')).toBe(false);
    expect(isAdminUser('user_a', undefined)).toBe(false);
  });

  it('returns true when clerkUserId is in the allowlist', () => {
    expect(isAdminUser('user_a', 'user_a,user_b')).toBe(true);
    expect(isAdminUser('user_b', 'user_a,user_b')).toBe(true);
  });

  it('returns false when clerkUserId is not in the allowlist', () => {
    expect(isAdminUser('user_c', 'user_a,user_b')).toBe(false);
  });

  it('is case-sensitive (Clerk userIds preserve case)', () => {
    expect(isAdminUser('User_A', 'user_a')).toBe(false);
  });
});

describe('adminUserCount', () => {
  it('reflects the parsed allowlist size', () => {
    expect(adminUserCount(null)).toBe(0);
    expect(adminUserCount('user_a')).toBe(1);
    expect(adminUserCount('user_a,user_b,user_c')).toBe(3);
    expect(adminUserCount('user_a,user_a')).toBe(1);
  });
});
