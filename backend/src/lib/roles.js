import { db } from './db.js';
import { PERMISSION_KEYS } from './permissions.js';

const roles = db.collection('roles');

/** Roles only ever carry permissions the catalog actually knows about. */
function onlyKnown(keys = []) {
  return [...new Set(keys.filter((key) => PERMISSION_KEYS.includes(key)))];
}

export function listRoles(workspaceId) {
  return roles.where((role) => role.workspaceId === workspaceId);
}

export function findRole(id, workspaceId) {
  return roles.find((role) => role.id === id && role.workspaceId === workspaceId);
}

export function findRoleByName(name, workspaceId) {
  const needle = name.trim().toLowerCase();
  return roles.find((role) => role.workspaceId === workspaceId && role.name.toLowerCase() === needle);
}

export function createRole({ workspaceId, name, permissions = [], label }) {
  return roles.insert({
    workspaceId,
    name: name.trim(),
    label: label?.trim() || name.trim(),
    permissions: onlyKnown(permissions),
    createdAt: new Date().toISOString(),
  });
}

export function updateRole(id, workspaceId, patch) {
  return roles.mutate((rows) => {
    const role = rows.find((row) => row.id === id && row.workspaceId === workspaceId);
    if (!role) return null;

    if (typeof patch.name === 'string' && patch.name.trim()) role.name = patch.name.trim();
    if (typeof patch.label === 'string' && patch.label.trim()) role.label = patch.label.trim();
    if (Array.isArray(patch.permissions)) role.permissions = onlyKnown(patch.permissions);
    return role;
  });
}

export function removeRole(id, workspaceId) {
  return roles.mutate((rows) => {
    const index = rows.findIndex((row) => row.id === id && row.workspaceId === workspaceId);
    if (index === -1) return null;

    return rows.splice(index, 1)[0];
  });
}
