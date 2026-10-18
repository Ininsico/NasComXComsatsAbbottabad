import { db } from './db.js';

/**
 * Companies: the top of the CRM model. Every contact belongs to a company, and every
 * opportunity points at a contact — so deleting a company breaks something deliberate, and
 * refusing that deletion with the count rather than quietly orphaning records is the
 * behaviour the spec asks for.
 */
const companies = db.collection('companies');

const text = (value, limit = 160) => String(value ?? '').trim().slice(0, limit);

const normaliseName = (value) => text(value, 160).replace(/\s+/g, ' ');

export async function listCompanies(workspaceId) {
  return (await companies.where((row) => row.workspaceId === workspaceId)).sort((a, b) =>
    normaliseName(a.name).localeCompare(normaliseName(b.name)),
  );
}

export async function findCompany(id, workspaceId) {
  return companies.find((row) => row.id === id && row.workspaceId === workspaceId);
}

export async function findCompanyByName(workspaceId, name) {
  const needle = normaliseName(name).toLowerCase();

  if (!needle) return null;

  return companies.find(
    (row) => row.workspaceId === workspaceId && normaliseName(row.name).toLowerCase() === needle,
  );
}

/**
 * Workspaces have isolation even when two companies share a name: the workspace id is part
 * of the match, so company "Acme" in workspace A is never company "Acme" in workspace B.
 */
export async function findOrCreateCompany({ workspaceId, name }) {
  const clean = normaliseName(name);

  if (!clean) return null;

  const existing = await findCompanyByName(workspaceId, clean);

  if (existing) return existing;

  return companies.insert({
    workspaceId,
    name: clean,
    domain: '',
    phone: '',
    address: '',
    industry: '',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function validateCompany(input = {}, { partial = false } = {}) {
  const errors = {};
  const values = {};

  const name = normaliseName(input.name);

  if (name.length < 2) {
    if (!partial) errors.name = 'Enter a company name (2 to 120 characters)';
  } else if (name.length > 120) {
    errors.name = 'Keep the company name under 120 characters';
  } else {
    values.name = name;
  }

  for (const field of ['domain', 'phone', 'address', 'industry']) {
    if (input[field] === undefined) continue;
    values[field] = text(input[field], field === 'address' ? 240 : 160);
  }

  return { errors, values };
}

export async function createCompany({ workspaceId, input }) {
  const { errors, values } = validateCompany(input);

  if (Object.keys(errors).length > 0) return { errors };

  const found = await findOrCreateCompany({ workspaceId, name: values.name });

  const updated = await companies.mutate((rows) => {
    const row = rows.find((entry) => entry.id === found.id);

    if (!row) return null;

    Object.assign(row, values, { updatedAt: new Date().toISOString() });

    return row;
  });

  return { company: updated };
}

export async function updateCompany({ workspaceId, id, input }) {
  const { errors, values } = validateCompany(input, { partial: true });

  if (Object.keys(errors).length > 0) return { errors };

  const updated = await companies.mutate((rows) => {
    const row = rows.find((entry) => entry.id === id && entry.workspaceId === workspaceId);

    if (!row) return null;

    if (values.name && values.name !== row.name) {
      // Renaming to a name another company already holds would merge two records by accident.
      const clash = findCompanyByNameStraight(rows, workspaceId, values.name);

      if (clash && clash.id !== id) {
        return { clash: true };
      }
    }

    Object.assign(row, values, { updatedAt: new Date().toISOString() });

    return row;
  });

  if (updated === null) return { missing: true };
  if (updated.clash) return { errors: { name: 'That name already belongs to another company in this workspace' } };

  return { company: updated };
}

/** Same match as findCompanyByName, but able to run synchronously inside a mutate lock. */
function findCompanyByNameStraight(rows, workspaceId, name) {
  const needle = normaliseName(name).toLowerCase();

  return (
    rows.find(
      (row) => row.workspaceId === workspaceId && normaliseName(row.name).toLowerCase() === needle,
    ) ?? null
  );
}

/**
 * Deleting is refused while contacts still belong to the company, with the count — the
 * caller brings that number so this module and lib/contacts.js stay independent. Silently
 * orphaning records is the one thing the spec will not forgive.
 */
export async function deleteCompany({ workspaceId, id, contactCount = 0 }) {
  return companies.mutate((rows) => {
    const index = rows.findIndex((row) => row.id === id && row.workspaceId === workspaceId);

    if (index === -1) return { missing: true };

    if (contactCount > 0) return { blocked: contactCount };

    const [removed] = rows.splice(index, 1);

    return { removed: normaliseName(removed.name) };
  });
}
