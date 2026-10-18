/**
 * The granular, name-independent permission catalog. Roles are user-named and
 * simply bundle a subset of these keys, so "Manager" is a role, not a level.
 */
export const PERMISSIONS = [
  { key: 'crm.view', label: 'View CRM records', group: 'CRM' },
  { key: 'crm.create', label: 'Create CRM records', group: 'CRM' },
  { key: 'crm.edit', label: 'Edit CRM records', group: 'CRM' },
  { key: 'crm.delete', label: 'Delete CRM records', group: 'CRM' },
  { key: 'crm.export', label: 'Export CRM records', group: 'CRM' },
  { key: 'assignment.manage', label: 'Manage assignment rules', group: 'CRM' },
  { key: 'opportunity_value.view', label: 'View opportunity value', group: 'CRM' },
  { key: 'integrations.manage', label: 'Manage integrations', group: 'Workspace' },
  { key: 'audit.view', label: 'View the audit log', group: 'Workspace' },
];

export const PERMISSION_KEYS = PERMISSIONS.map((permission) => permission.key);

/** The three fixed base levels. Everything beyond these is a configurable role. */
export const LEVELS = ['owner', 'admin', 'user'];

export const LEVEL_LABELS = { owner: 'Owner', admin: 'Admin', user: 'User' };

const LEVEL_RANK = { owner: 3, admin: 2, user: 1 };

/** What a member holds before any role or explicit grant is applied. */
export const LEVEL_DEFAULTS = {
  owner: [...PERMISSION_KEYS],
  admin: [
    'crm.view',
    'crm.create',
    'crm.edit',
    'crm.delete',
    'crm.export',
    'assignment.manage',
    'opportunity_value.view',
    'integrations.manage',
    'audit.view',
  ],
  user: ['crm.view', 'crm.create'],
};

export function rank(level) {
  return LEVEL_RANK[level] ?? 0;
}

/** True only when `actorLevel` sits strictly above `targetLevel`. */
export function outranks(actorLevel, targetLevel) {
  return rank(actorLevel) > rank(targetLevel);
}

/**
 * The effective permission set for a member: the base level's defaults, or the
 * attached role's permissions when there is one, plus explicit grants, minus
 * explicit revocations. An owner always holds every permission.
 */
export function resolvePermissions({ level, rolePermissions = [], granted = [], revoked = [] }) {
  if (level === 'owner') return [...PERMISSION_KEYS];

  const base = rolePermissions.length > 0 ? rolePermissions : LEVEL_DEFAULTS[level] ?? [];
  const effective = new Set([...base, ...granted]);
  for (const key of revoked) effective.delete(key);

  return PERMISSION_KEYS.filter((key) => effective.has(key));
}

export const VALUE_PERMISSION = 'opportunity_value.view';

export function canSeeValue(permissions = []) {
  return permissions.includes(VALUE_PERMISSION);
}

/**
 * Remove opportunity value from a record for a caller who may not see it.
 *
 * Applied on the server, in every response, because a hidden field in a browser is not
 * enforcement — the value must not leave the process. The record keeps an explicit
 * `valueHidden` flag so the UI can say "restricted" instead of showing a misleading zero.
 */
export function maskValue(record, permissions) {
  if (!record || canSeeValue(permissions)) return record;

  const { value, ...rest } = record;

  return { ...rest, value: null, valueHidden: true };
}

export function maskValues(records, permissions) {
  if (canSeeValue(permissions)) return records;

  return records.map((record) => maskValue(record, permissions));
}
