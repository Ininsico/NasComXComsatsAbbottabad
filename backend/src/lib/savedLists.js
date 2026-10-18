import { db } from './db.js';

/**
 * Saved lists: a named set of criteria that is evaluated against the live pipeline, so the
 * list shrinks and grows as records start and stop matching. Nothing is cached: a saved
 * list is a query, not a snapshot.
 *
 * The evaluator is pure — rows in, rows out — because "which records count" is the kind of
 * rule that should be unit tested rather than clicked at.
 */
const savedLists = db.collection('savedLists');

/** The fields a criterion may look at, with the label the UI shows. */
export const LIST_FIELDS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'companyName', label: 'Company', type: 'text' },
  { key: 'contactName', label: 'Contact', type: 'text' },
  { key: 'stage', label: 'Stage', type: 'text' },
  { key: 'source', label: 'Source', type: 'text' },
  { key: 'assigneeName', label: 'Owner', type: 'text' },
  { key: 'value', label: 'Value', type: 'number' },
  { key: 'escalationLevel', label: 'Escalation level', type: 'number' },
  { key: 'createdAt', label: 'Created (date)', type: 'date' },
  { key: 'updatedAt', label: 'Updated (date)', type: 'date' },
  { key: 'acknowledgedAt', label: 'Acknowledged (date)', type: 'date' },
];

export const LIST_OPS = [
  { key: 'eq', label: 'is' },
  { key: 'neq', label: 'is not' },
  { key: 'contains', label: 'contains' },
  { key: 'in', label: 'is any of (comma separated)' },
  { key: 'gt', label: 'is more than' },
  { key: 'gte', label: 'is at least' },
  { key: 'lt', label: 'is less than' },
  { key: 'lte', label: 'is at most' },
];

const FIELD_KEYS = new Set(LIST_FIELDS.map((field) => field.key));
const OP_KEYS = new Set(LIST_OPS.map((op) => op.key));

const text = (value, limit = 120) => String(value ?? '').trim().slice(0, limit);
const lower = (value) => String(value ?? '').trim().toLowerCase();

/** One criterion against one record. Pure, so the semantics are testable. */
export function matchesCriterion(row, criterion) {
  const field = String(criterion?.field ?? '');
  const op = String(criterion?.op ?? 'eq');
  const wanted = criterion?.value ?? '';
  const actual = row?.[field];

  if (op === 'contains') {
    return lower(actual).includes(lower(wanted));
  }

  if (op === 'in') {
    const list = String(wanted)
      .split(',')
      .map((item) => lower(item))
      .filter(Boolean);

    return list.length > 0 && list.includes(lower(actual));
  }

  if (['gt', 'gte', 'lt', 'lte'].includes(op)) {
    const numeric = ['value', 'escalationLevel'].includes(field);

    if (numeric) {
      const left = Number(actual ?? 0);
      const right = Number(wanted);

      if (!Number.isFinite(right)) return false;

      if (op === 'gt') return left > right;
      if (op === 'gte') return left >= right;
      if (op === 'lt') return left < right;
      return left <= right;
    }

    // Dates are ISO strings, so lexicographic comparison is chronological.
    const left = String(actual ?? '');
    const right = String(wanted ?? '');

    if (!left || !right) return false;

    if (op === 'gt') return left > right;
    if (op === 'gte') return left >= right;
    if (op === 'lt') return left < right;
    return left <= right;
  }

  if (op === 'neq') return lower(actual) !== lower(wanted);

  return lower(actual) === lower(wanted);
}

/**
 * Every criterion must match — a saved list is an AND, which is what "combining criteria"
 * means to someone reading the list back.
 */
export function evaluateRows(rows, criteria) {
  const active = (criteria ?? []).filter((criterion) => FIELD_KEYS.has(criterion.field));

  if (active.length === 0) return rows;

  return rows.filter((row) => active.every((criterion) => matchesCriterion(row, criterion)));
}

export function validateList(input = {}) {
  const errors = {};
  const name = text(input.name, 80);
  const criteria = Array.isArray(input.criteria) ? input.criteria : [];

  if (name.length < 2) errors.name = 'Give the list a name';

  if (criteria.length === 0) errors.criteria = 'Add at least one criterion';
  if (criteria.length > 8) errors.criteria = 'Keep it to eight criteria';

  const clean = [];

  for (const [index, criterion] of criteria.entries()) {
    if (!FIELD_KEYS.has(criterion?.field)) {
      errors[`criteria.${index}`] = 'Pick a field';
      continue;
    }

    if (!OP_KEYS.has(criterion?.op)) {
      errors[`criteria.${index}`] = 'Pick a comparison';
      continue;
    }

    const value = text(criterion?.value, 80);

    if (!value) {
      errors[`criteria.${index}`] = 'Give the criterion a value';
      continue;
    }

    clean.push({ field: criterion.field, op: criterion.op, value });
  }

  return { errors, values: { name, criteria: clean } };
}

export async function listSavedLists(workspaceId) {
  return (await savedLists.where((row) => row.workspaceId === workspaceId)).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export async function createSavedList({ workspaceId, input, user }) {
  const { errors, values } = validateList(input);

  if (Object.keys(errors).length > 0) return { errors };

  return {
    list: await savedLists.insert({
      workspaceId,
      name: values.name,
      criteria: values.criteria,
      shared: Boolean(input.shared),
      createdBy: user.id,
      createdByName: user.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };
}

export async function updateSavedList({ workspaceId, id, input }) {
  const { errors, values } = validateList(input);

  if (Object.keys(errors).length > 0) return { errors };

  const updated = await savedLists.mutate((rows) => {
    const row = rows.find((entry) => entry.id === id && entry.workspaceId === workspaceId);

    if (!row) return null;

    row.name = values.name;
    row.criteria = values.criteria;
    row.shared = Boolean(input.shared);
    row.updatedAt = new Date().toISOString();

    return row;
  });

  return updated ? { list: updated } : { missing: true };
}

export async function deleteSavedList({ workspaceId, id }) {
  return savedLists.mutate((rows) => {
    const index = rows.findIndex((row) => row.id === id && row.workspaceId === workspaceId);

    if (index === -1) return { missing: true };

    return { removed: rows.splice(index, 1)[0] };
  });
}

export async function findSavedList({ workspaceId, id }) {
  return savedLists.find((row) => row.id === id && row.workspaceId === workspaceId);
}
