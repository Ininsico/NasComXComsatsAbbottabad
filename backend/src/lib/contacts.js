import { EMAIL_PATTERN } from './validate.js';
import { db } from './db.js';

/**
 * Contacts: a person belonging to a company, holding many opportunities.
 *
 * Idempotent matching matters the most here. A WhatsApp inbound message and a website form
 * must land on the same record rather than create a duplicate, so both an email and the last
 * ten digits of a phone resolve to the same contact.
 */
const contacts = db.collection('contacts');

const text = (value, limit = 160) => String(value ?? '').trim().slice(0, limit);

const normaliseName = (value) => text(value, 120).replace(/\s+/g, ' ');

export const digitsOf = (value) => String(value ?? '').replace(/\D/g, '');

/** Last ten digits, which absorbs country-code and formatting differences. */
export function phoneKey(value) {
  const digits = digitsOf(value);

  return digits.length >= 10 ? digits.slice(-10) : digits.length >= 7 ? digits : '';
}

export function phoneMatches(a, b) {
  const left = phoneKey(a);
  const right = phoneKey(b);

  if (left.length < 7 || right.length < 7) return false;

  return left.slice(-10) === right.slice(-10);
}

export function emailsMatch(a, b) {
  const left = String(a ?? '').trim().toLowerCase();
  const right = String(b ?? '').trim().toLowerCase();

  return Boolean(left) && Boolean(right) && left === right;
}

export async function listContacts(workspaceId) {
  return (await contacts.where((row) => row.workspaceId === workspaceId)).sort((a, b) =>
    normaliseName(a.name).localeCompare(normaliseName(b.name)),
  );
}

export async function findContact(id, workspaceId) {
  return contacts.find((row) => row.id === id && row.workspaceId === workspaceId);
}

export async function countContactsByCompany(workspaceId, companyId) {
  return (await contacts.where((row) => row.workspaceId === workspaceId && row.companyId === companyId)).length;
}

/**
 * The best existing record for an identity, or null. Email wins when both sides have one;
 * otherwise a phone match. Never both at once: mis-typed emails should not steal a record
 * away from a clean phone match.
 */
export async function findContactForIdentity(workspaceId, { email, phone } = {}) {
  const rows = await contacts.where((row) => row.workspaceId === workspaceId);

  if (email) {
    const byEmail = rows.find((row) => emailsMatch(row.email, email));

    if (byEmail) return byEmail;
  }

  if (phone) {
    return rows.find((row) => phoneMatches(row.phone, phone)) ?? null;
  }

  return null;
}

export function validateContact(input = {}, { partial = false } = {}) {
  const errors = {};
  const values = {};

  const name = normaliseName(input.name);

  if (!name) {
    if (!partial) errors.name = 'A contact needs a name';
  } else if (name.length < 2 || name.length > 120) {
    errors.name = 'Keep the name between 2 and 120 characters';
  } else {
    values.name = name;
  }

  if (input.email !== undefined) {
    const email = text(input.email, 160).toLowerCase();

    if (!email) values.email = '';
    else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address';
    else values.email = email;
  }

  if (input.phone !== undefined) {
    const phone = text(input.phone, 24);
    const digits = digitsOf(phone);

    if (!phone) values.phone = '';
    else if (digits.length < 7) errors.phone = 'Enter a phone number with at least 7 digits';
    else values.phone = phone;
  }

  if (input.title !== undefined) values.title = text(input.title, 80);

  return { errors, values };
}

export async function createContact({ workspaceId, input, companyId = null }) {
  const { errors, values } = validateContact(input);

  if (Object.keys(errors).length > 0) return { errors };

  const existing = await findContactForIdentity(workspaceId, {
    email: values.email,
    phone: values.phone,
  });

  if (existing) return { duplicate: existing };

  return {
    contact: await contacts.insert({
      workspaceId,
      companyId: companyId ?? null,
      name: values.name,
      email: values.email ?? '',
      phone: values.phone ?? '',
      title: values.title ?? '',
      optOut: { whatsapp: false, at: null, reason: null },
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActivityAt: null,
    }),
  };
}

export async function updateContact({ workspaceId, id, input }) {
  const { errors, values } = validateContact(input, { partial: true });

  if (Object.keys(errors).length > 0) return { errors };

  const updated = await contacts.mutate((rows) => {
    const row = rows.find((entry) => entry.id === id && entry.workspaceId === workspaceId);

    if (!row) return null;

    if (Object.entries(values).length > 0) {
      Object.assign(row, values, { updatedAt: new Date().toISOString() });
    }

    if (input.companyId !== undefined) {
      row.companyId = input.companyId || null;
      row.updatedAt = new Date().toISOString();
    }

    if (input.tags !== undefined && Array.isArray(input.tags)) {
      row.tags = input.tags.filter(Boolean).slice(0, 16).map((tag) => text(tag, 40));
    }

    return row;
  });

  if (!updated) return { missing: true };

  return { contact: updated };
}

/**
 * A contact stops receiving messages when they say so. Stored with when and why, because
 * "blocked from messaging with the reason explained" is a product promise, not a flag to
 * flip quietly.
 */
export async function optOutContact({ workspaceId, id, reason = 'opted out on WhatsApp' }) {
  return contacts.mutate((rows) => {
    const row = rows.find((entry) => entry.id === id && entry.workspaceId === workspaceId);

    if (!row) return null;

    row.optOut = { whatsapp: true, at: new Date().toISOString(), reason: text(reason, 200) };
    row.updatedAt = row.optOut.at;

    return row;
  });
}

export function optOutBlocked(contact) {
  return Boolean(contact?.optOut?.whatsapp);
}

/** How many records still point here, so a delete can refuse rather than orphan. */
export async function contactReferences(workspaceId, id) {
  const opportunities = await db.collection('leads').where(
    (row) => row.workspaceId === workspaceId && row.contactId === id,
  );

  return { opportunities: opportunities.length };
}

export async function deleteContact({ workspaceId, id, references = { opportunities: 0 } }) {
  return contacts.mutate((rows) => {
    const index = rows.findIndex((row) => row.id === id && row.workspaceId === workspaceId);

    if (index === -1) return { missing: true };

    if (references.opportunities > 0) {
      return { blocked: references };
    }

    const [removed] = rows.splice(index, 1);

    return { removed: normaliseName(removed.name) };
  });
}
