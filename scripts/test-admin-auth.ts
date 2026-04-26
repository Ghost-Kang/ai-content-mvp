// W4-07-V3 — unit tests for admin allowlist parser/guard.
//
// Pure function tests only (no DB, no Clerk, no env-file needed).
// Run: pnpm wf:test:admin

import {
  adminUserCount,
  isAdminUser,
  parseAdminUserIds,
} from '../src/lib/admin/is-admin';

let failures = 0;
const expect = (cond: boolean, msg: string) => {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${tag}] ${msg}`);
};

function caseParseEmpty() {
  console.log('\n[case 1] parseAdminUserIds — empty-ish inputs');
  expect(parseAdminUserIds(undefined).size === 0, 'undefined -> empty set');
  expect(parseAdminUserIds(null).size === 0, 'null -> empty set');
  expect(parseAdminUserIds('').size === 0, "'' -> empty set");
  expect(parseAdminUserIds('   ').size === 0, 'whitespace -> empty set');
}

function caseParseDedupAndTrim() {
  console.log('\n[case 2] parseAdminUserIds — trim + dedupe');
  const set = parseAdminUserIds(' user_a , user_b,user_a ,, user_c ');
  expect(set.size === 3, `size === 3 (got ${set.size})`);
  expect(set.has('user_a'), 'has user_a');
  expect(set.has('user_b'), 'has user_b');
  expect(set.has('user_c'), 'has user_c');
}

function caseParseQuotes() {
  console.log('\n[case 3] parseAdminUserIds — quoted env payload');
  const single = parseAdminUserIds("'user_a,user_b'");
  expect(single.size === 2, `single-quoted parses 2 ids (got ${single.size})`);
  expect(single.has('user_a') && single.has('user_b'), 'single-quoted ids parsed');

  const dbl = parseAdminUserIds('"user_x,user_y"');
  expect(dbl.size === 2, `double-quoted parses 2 ids (got ${dbl.size})`);
  expect(dbl.has('user_x') && dbl.has('user_y'), 'double-quoted ids parsed');
}

function caseIsAdminUser() {
  console.log('\n[case 4] isAdminUser — fail-closed + match logic');
  const raw = 'user_admin_1,user_admin_2';
  expect(isAdminUser(undefined, raw) === false, 'undefined user -> false');
  expect(isAdminUser(null, raw) === false, 'null user -> false');
  expect(isAdminUser('user_guest', raw) === false, 'non-member user -> false');
  expect(isAdminUser('user_admin_2', raw) === true, 'member user -> true');
  expect(isAdminUser('user_admin_2', undefined) === false, 'empty allowlist -> false');
}

function caseAdminUserCount() {
  console.log('\n[case 5] adminUserCount — count after normalize');
  expect(adminUserCount(undefined) === 0, 'undefined -> 0');
  expect(adminUserCount('user_a, user_b, user_a') === 2, 'dedupe reflected in count');
}

function main() {
  console.log('--- W4-07-V3 admin auth unit tests ---');
  caseParseEmpty();
  caseParseDedupAndTrim();
  caseParseQuotes();
  caseIsAdminUser();
  caseAdminUserCount();

  if (failures === 0) {
    console.log('\n✅ All assertions pass.');
    process.exit(0);
  }
  console.log(`\n❌ ${failures} assertion(s) failed.`);
  process.exit(1);
}

main();
