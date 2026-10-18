import { Router } from 'express';
import { record as audit } from '../lib/audit.js';
import { requireAuth } from '../lib/auth.js';
import { requirePermission, workspaceContext } from '../lib/context.js';
import {
  contactReferences,
  createContact,
  deleteContact,
  findContact,
  listContacts,
  optOutContact,
  updateContact,
} from '../lib/contacts.js';
import { findCompany, listCompanies } from '../lib/companies.js';
import { listLeads } from '../lib/leads.js';
import { maskValues } from '../lib/permissions.js';

const router = Router();

router.use(requireAuth, workspaceContext);

/**
 * Contacts — the person behind the pipeline records. The detail response carries the
 * company, every opportunity for this person, and their opt-out state; the values inside
 * those opportunities are masked for a caller without opportunity_value.view, because a
 * nested endpoint is still an endpoint.
 */
router.get('/', requirePermission('crm.view'), async (req, res) => {
  const [contacts, leads, companies] = await Promise.all([
    listContacts(req.workspace.id),
    listLeads(req.workspace.id, {}),
    listCompanies(req.workspace.id),
  ]);

  const companyNames = new Map(companies.map((company) => [company.id, company.name]));

  const rows = maskValues(
    contacts.map((contact) => ({
      ...contact,
      companyName: contact.companyId ? (companyNames.get(contact.companyId) ?? null) : null,
      opportunityCount: leads.filter((lead) => lead.contactId === contact.id).length,
    })),
    req.permissions,
  );

  res.json({ contacts: rows });
});

router.post('/', requirePermission('crm.create'), async (req, res) => {
  let companyId = null;

  if (req.body?.companyId) {
    const company = await findCompany(String(req.body.companyId), req.workspace.id);

    if (!company) return res.status(400).json({ error: 'No such company in this workspace' });

    companyId = company.id;
  }

  const result = await createContact({
    workspaceId: req.workspace.id,
    companyId,
    input: req.body ?? {},
  });

  if (result.errors) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields: result.errors });
  }

  if (result.duplicate) {
    return res.status(409).json({
      error: 'That person is already a contact here',
      contact: result.duplicate,
    });
  }

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'contact.created',
    target: result.contact.id,
    metadata: { name: result.contact.name, email: result.contact.email, phone: result.contact.phone },
  });

  return res.status(201).json({ contact: result.contact });
});

/** One contact, fully: the company, the opportunities, and the messaging state. */
router.get('/:id', requirePermission('crm.view'), async (req, res) => {
  const contact = await findContact(req.params.id, req.workspace.id);

  if (!contact) return res.status(404).json({ error: 'No such contact' });

  const [company, opportunities] = await Promise.all([
    contact.companyId
      ? findCompany(contact.companyId, req.workspace.id)
      : Promise.resolve(null),
    listLeads(req.workspace.id, {}),
  ]);

  const theirOpportunities = maskValues(
    opportunities.filter((lead) => lead.contactId === contact.id),
    req.permissions,
  );

  res.json({ contact, company, opportunities: theirOpportunities });
});

router.patch('/:id', requirePermission('crm.edit'), async (req, res) => {
  const result = await updateContact({
    workspaceId: req.workspace.id,
    id: req.params.id,
    input: req.body ?? {},
  });

  if (result.missing) return res.status(404).json({ error: 'No such contact' });
  if (result.errors) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields: result.errors });
  }

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'contact.updated',
    target: result.contact.id,
    metadata: { fields: Object.keys(req.body ?? {}) },
  });

  return res.json({ contact: result.contact });
});

router.delete('/:id', requirePermission('crm.delete'), async (req, res) => {
  const references = await contactReferences(req.workspace.id, req.params.id);
  const result = await deleteContact({
    workspaceId: req.workspace.id,
    id: req.params.id,
    references,
  });

  if (result.missing) return res.status(404).json({ error: 'No such contact' });

  if (result.blocked) {
    return res.status(409).json({
      error: `This contact has ${result.blocked?.opportunities ?? 0} lead(s). Delete or move those first.`,
    });
  }

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'contact.deleted',
    target: req.params.id,
    metadata: { name: result.removed },
  });

  return res.json({ ok: true, removed: result.removed });
});

/**
 * An opt-out is a promise about messaging, so it is recorded with when and why, and it is
 * not a delete: the record stays, listable and audited, and simply stops being messaged.
 */
router.post('/:id/opt-out', requirePermission('integrations.manage'), async (req, res) => {
  const updated = await optOutContact({
    workspaceId: req.workspace.id,
    id: req.params.id,
    reason: String(req.body?.reason ?? 'opted out'),
  });

  if (!updated) return res.status(404).json({ error: 'No such contact' });

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'contact.opted_out',
    target: updated.id,
    metadata: { reason: updated.optOut?.reason ?? null },
  });

  return res.json({ contact: updated });
});

export default router;
