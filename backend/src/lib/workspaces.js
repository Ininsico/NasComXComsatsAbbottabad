import { db } from './db.js';

const workspaces = db.collection('workspaces');

export function findWorkspace(id) {
  return workspaces.find((workspace) => workspace.id === id);
}

export function listWorkspaces() {
  return workspaces.read();
}

/** The very first signup creates a workspace and becomes its Owner (F1.1). */
export function createWorkspace({ name, ownerId }) {
  return workspaces.insert({
    name: name.trim(),
    ownerId,
    createdAt: new Date().toISOString(),
  });
}

export function updateWorkspace(id, patch) {
  return workspaces.mutate((rows) => {
    const workspace = rows.find((row) => row.id === id);
    if (!workspace) return null;

    Object.assign(workspace, patch, { id: workspace.id });
    return workspace;
  });
}

/** Whichever workspace the very first account ends up owning. */
export async function firstOwnedWorkspace(ownerId) {
  const rows = await workspaces.read();
  return rows.find((workspace) => workspace.ownerId === ownerId) ?? null;
}
