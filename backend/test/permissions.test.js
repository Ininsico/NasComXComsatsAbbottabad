import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEVEL_DEFAULTS,
  PERMISSION_KEYS,
  canSeeValue,
  maskValue,
  maskValues,
  outranks,
  resolvePermissions,
} from '../src/lib/permissions.js';

/**
 * Permissions and value masking are the parts an Admin configures and an auditor checks,
 * so they are tested directly. Both are pure: rules in, effective set out.
 */

test('an owner holds every permission, whatever a role tries to remove', () => {
  const effective = resolvePermissions({
    level: 'owner',
    rolePermissions: ['crm.view'],
    revoked: ['crm.delete', 'audit.view'],
  });

  assert.deepEqual(effective, PERMISSION_KEYS);
});

test('an admin gets the admin bundle, not the owner bundle', () => {
  const effective = resolvePermissions({ level: 'admin' });

  assert.deepEqual(effective, PERMISSION_KEYS.filter((key) => LEVEL_DEFAULTS.admin.includes(key)));
  assert.ok(effective.includes('audit.view'));
  assert.ok(!effective.includes('crm.export') === false);
});

test('a user starts with view and create only', () => {
  const effective = resolvePermissions({ level: 'user' });

  assert.deepEqual(effective, ['crm.view', 'crm.create']);
});

test('an attached role replaces the level defaults, so "Manager" is a bundle not a level', () => {
  const manager = ['crm.view', 'crm.create', 'crm.edit', 'assignment.manage', 'audit.view'];
  const effective = resolvePermissions({ level: 'user', rolePermissions: manager });

  assert.deepEqual(effective, manager);
  assert.ok(effective.includes('assignment.manage'));
  assert.ok(!effective.includes('crm.delete'));
});

test('an explicit grant adds a permission a role withheld', () => {
  const effective = resolvePermissions({
    level: 'user',
    rolePermissions: ['crm.view'],
    granted: ['crm.export'],
  });

  assert.deepEqual(effective, ['crm.view', 'crm.export']);
});

test('an explicit revoke removes a permission the level would have granted', () => {
  const effective = resolvePermissions({ level: 'user', revoked: ['crm.create'] });

  assert.deepEqual(effective, ['crm.view']);
});

test('an unknown permission key never leaks into the effective set', () => {
  const effective = resolvePermissions({ level: 'user', granted: ['crm.destroy_everything'] });

  assert.deepEqual(effective, ['crm.view', 'crm.create']);
});

test('outranks is strict, so equals cannot modify each other', () => {
  assert.equal(outranks('owner', 'admin'), true);
  assert.equal(outranks('admin', 'user'), true);
  assert.equal(outranks('admin', 'admin'), false);
  assert.equal(outranks('user', 'owner'), false);
  assert.equal(outranks('user', 'manager_typo'), true);
});

test('canSeeValue reflects the value permission specifically', () => {
  assert.equal(canSeeValue(['crm.view', 'opportunity_value.view']), true);
  assert.equal(canSeeValue(['crm.view']), false);
  assert.equal(canSeeValue([]), false);
});

test('maskValue removes the value and says so, rather than pretending it is zero', () => {
  const masked = maskValue({ id: 'lead-1', name: 'Acme', value: 5000 }, ['crm.view']);

  assert.equal(masked.value, null);
  assert.equal(masked.valueHidden, true);
  assert.equal(masked.name, 'Acme');
  assert.ok(!('value' in masked) === false);
  assert.equal(JSON.stringify(masked).includes('5000'), false, 'the number must not survive');
});

test('maskValue leaves the value alone for a caller who may see it', () => {
  const record = { id: 'lead-1', value: 5000 };
  const masked = maskValue(record, ['opportunity_value.view']);

  assert.equal(masked.value, 5000);
  assert.equal(masked.valueHidden, undefined);
});

test('maskValue tolerates a missing record', () => {
  assert.equal(maskValue(null, []), null);
  assert.equal(maskValue(undefined, ['crm.view']), undefined);
});

test('maskValues maps over a list and keeps every other field', () => {
  const records = [
    { id: 'a', value: 10, stage: 'new' },
    { id: 'b', value: 20, stage: 'won' },
  ];

  const masked = maskValues(records, ['crm.view']);

  assert.equal(masked.length, 2);
  assert.deepEqual(masked.map((record) => record.value), [null, null]);
  assert.deepEqual(masked.map((record) => record.stage), ['new', 'won']);
});

test('maskValues is a passthrough for a caller with the value permission', () => {
  const records = [{ id: 'a', value: 10 }];

  assert.equal(maskValues(records, ['opportunity_value.view']), records);
});
