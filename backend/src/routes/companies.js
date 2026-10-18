import { Router } from 'express';
import { record as audit } from '../lib/audit.js';
import { requireAuth } from '../lib/auth.js';
import {
  createCompany,
  deleteCompany,
  listCompanies,
  updateCompany,
} from '../lib/companies.js';
import { requirePermission, workspaceContext } from '../lib/context.js';
import { countContactsByCompany, findContact, listContacts } from '../lib/contacts.js';
import { listLeads } from '../lib/leads.js';
import { maskValues } from '../lib/permissions.js';

const router = Router();

router.use(requireAuth, workspaceContext);

/**
 * Companies.
 *
 * Every read is scoped by workspace, like every other route. A deletion is refused with the
 * number of contacts still inside — this module and lib/contacts.js deliberately know
 * nothing about each other's internals, so the caller brings that number.
 */
router.get('/', requirePermission('crm.view'), async (req, res) => {
  const companies = await listCompanies(req.workspace.id);

  const counted = await Promise.all(
    companies.map(async (company) => ({
      ...company,
      contactCount: await countContactsByCompany(req.workspace.id, company.id),
    })),
  );

  res.json({ companies: counted });
});

router.post('/', requirePermission('crm.create'), async (req, res) => {
  const result = await createCompany({
    workspaceId: req.workspace.id,
    input: req.body ?? {},
  });

  if (result.errors) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields: result.errors });
  }

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'company.created',
    target: result.company.id,
    metadata: { name: result.company.name },
  });

  return res.status(201).json({ company: result.company });
});

/** One company, its contacts, and every opportunity those contacts are on. */
router.get('/:id', requirePermission('crm.view'), async (req, res) => {
  const company = (await listCompanies(req.workspace.id)).find((row) => row.id === req.params.id);

  if (!company) return res.status(404).json({ error: 'No such company' });

  const [contacts, leads] = await Promise.all([
    listContacts(req.workspace.id),
    listLeads(req.workspace.id, {}),
  ]);

  const contactIds = new Set(contacts.filter((row) => row.companyId === company.id).map((row) => row.id));

  return res.json({
    company: { ...company, contactCount: contactIds.size },
    contacts: maskValues(contacts.filter((row) => row.companyId === company.id), req.permissions),
    opportunities: maskValues(
      leads.filter((lead) => contactIds.has(lead.contactId) || lead.companyId === company.id),
      req.permissions,
    ),
  });
});

router.patch('/:id', requirePermission('crm.edit'), async (req, res) => {
  const result = await updateCompany({
    workspaceId: req.workspace.id,
    id: req.params.id,
    input: req.body ?? {},
  });

  if (result.missing) return res.status(404).json({ error: 'No such company' });
  if (result.errors) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields: result.errors });
  }

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'company.updated',
    target: result.company.id,
    metadata: { fields: Object.keys(req.body ?? {}) },
  });

  return res.json({ company: result.company });
});

router.delete('/:id', requirePermission('crm.delete'), async (req, res) => {
  const contactCount = await countContactsByCompany(req.workspace.id, req.params.id);
  const result = await deleteCompany({
    workspaceId: req.workspace.id,
    id: req.params.id,
    contactCount,
  });

  if (result.missing) return res.status(404).json({ error: 'No such company' });

  if (result.blocked) {
    return res.status(409).json({
      error: `This company still has ${result.blocked} contact(s). Move or delete them first.`,
      contactCount: result.blocked,
    });
  }

  await audit({
    workspaceId: req.workspace.id,
    actorId: req.user.id,
    action: 'company.deleted',
    target: req.params.id,
    metadata: { name: result.removed },
  });

  return res.json({ ok: true, removed: result.removed });
});

export default router;
