import { CircleCheckBig, Plus, Save, ShieldCheck, Trash, UserCog } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { workspaceApi } from '../lib/api.js';

const TARGETS = [
  { value: 'next', label: 'Next available rep' },
  { value: 'backup', label: 'Backup member' },
  { value: 'manager', label: 'Manager (an admin or the owner)' },
];

/**
 * Workspace administration: how work is assigned, who is in the workspace, and what each
 * role may do.
 *
 * A role here is a permission bundle, not a level — "Manager" is just a role someone
 * created out of the catalog. The server resolves the effective set (level defaults, or
 * the role's bundle, plus grants, minus revocations) and enforces it on every endpoint,
 * so this page decides what people may do rather than what they see.
 */
const REQUIRABLE = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'value', label: 'Value' },
  { key: 'notes', label: 'Notes' },
];

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
];

const EMPTY_STAGE = { key: '', label: '', required: [], isClosed: false, isWon: false };
const EMPTY_FIELD = { key: '', label: '', type: 'text', options: '', required: false };

export default function WorkspaceSettings() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [state, setState] = useState(null);
  const [roles, setRoles] = useState([]);
  const [settings, setSettings] = useState(null);
  const [pipeline, setPipeline] = useState([]);
  const [fields, setFields] = useState([]);
  const [newStage, setNewStage] = useState(EMPTY_STAGE);
  const [newField, setNewField] = useState(EMPTY_FIELD);
  const [newRole, setNewRole] = useState({ name: '', permissions: ['crm.view'] });
  const [busy, setBusy] = useState('');

  const apply = useCallback((payload) => {
    setState(payload);
    setSettings(payload.settings);
    setPipeline(payload.settings?.pipeline ?? []);
    setFields(payload.settings?.customFields ?? []);
  }, []);

  const fetchAll = useCallback(async () => {
    const [workspace, rolePayload] = await Promise.all([workspaceApi.get(token), workspaceApi.roles(token)]);

    return { workspace, roles: rolePayload.roles ?? [] };
  }, [token]);

  const refresh = useCallback(
    () =>
      fetchAll()
        .then(({ workspace, roles: list }) => {
          apply(workspace);
          setRoles(list);
        })
        .catch((error) =>
          showToast({ tone: 'error', title: 'Could not load the workspace', message: error.message }),
        ),
    [fetchAll, apply, showToast],
  );

  useEffect(() => {
    let active = true;

    fetchAll()
      .then(({ workspace, roles: list }) => {
        if (!active) return;
        apply(workspace);
        setRoles(list);
      })
      .catch((error) => {
        if (active) {
          showToast({ tone: 'error', title: 'Could not load the workspace', message: error.message });
        }
      });

    return () => {
      active = false;
    };
  }, [fetchAll, apply, showToast]);

  async function run(key, action, successTitle) {
    setBusy(key);

    try {
      await action();

      if (successTitle) showToast({ tone: 'success', title: successTitle });

      await refresh();
    } catch (error) {
      showToast({ tone: 'error', title: 'That did not work', message: error.message });
    } finally {
      setBusy('');
    }
  }

  if (!state || !settings) return <p className="hint">Loading the workspace…</p>;

  const mine = state.member;
  const members = state.members ?? [];
  const levels = state.levels ?? [];
  const catalog = state.permissions ?? [];
  const canManage = (mine.permissions ?? []).includes('assignment.manage');
  const ladder = settings.escalation ?? [];

  const groups = catalog.reduce((accumulator, permission) => {
    accumulator[permission.group] = [...(accumulator[permission.group] ?? []), permission];
    return accumulator;
  }, {});

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Workspace settings</h1>
          <p>
            {state.workspace?.name} · assignment rules, members and what each role may do
          </p>
        </div>
      </div>

      {!canManage ? (
        <p className="alert alert--pending" style={{ marginBottom: '1.25rem' }}>
          <ShieldCheck size={15} aria-hidden="true" />
          You can read this page, but only a member with <code>assignment.manage</code> can change it.
        </p>
      ) : null}

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <span className="label-micro">
          <UserCog size={12} aria-hidden="true" /> Your access
        </span>
        <h3 style={{ marginTop: '0.25rem' }}>
          {mine.name} · {mine.levelLabel}
          {mine.roleId ? ` · role: ${roles.find((role) => role.id === mine.roleId)?.name ?? mine.roleId}` : ''}
        </h3>

        <div className="btn-row" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
          {catalog.map((permission) => {
            const held = (mine.permissions ?? []).includes(permission.key);

            return (
              <span
                key={permission.key}
                className={`pill ${held ? 'pill--done' : 'pill--neutral'}`}
                title={permission.label}
              >
                {held ? <CircleCheckBig size={12} aria-hidden="true" /> : null}
                {permission.key}
              </span>
            );
          })}
        </div>

        <p className="hint" style={{ marginBottom: 0 }}>
          These are enforced by the server on every request. Hiding a control is never the
          protection.
        </p>
      </section>

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <span className="label-micro">Acknowledgement</span>
        <h3 style={{ marginTop: '0.25rem' }}>How long an opportunity may sit unanswered</h3>

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.target);

            void run(
              'timers',
              () =>
                workspaceApi.updateSettings(token, {
                  acknowledgeSeconds: Number(data.get('acknowledgeSeconds')),
                  idleHours: Number(data.get('idleHours')),
                  maxOpenLeads: Number(data.get('maxOpenLeads')),
                  timezone: data.get('timezone'),
                }),
              'Rules saved',
            );
          }}
        >
          <div className="grid grid-3">
            <div className="field">
              <label htmlFor="ack">Acknowledge within (seconds)</label>
              <input
                id="ack"
                name="acknowledgeSeconds"
                className="input"
                type="number"
                min="1"
                defaultValue={settings.acknowledgeSeconds}
                disabled={!canManage}
              />
            </div>
            <div className="field">
              <label htmlFor="idle">Recovery queue after idle (hours)</label>
              <input
                id="idle"
                name="idleHours"
                className="input"
                type="number"
                min="1"
                defaultValue={settings.idleHours}
                disabled={!canManage}
              />
            </div>
            <div className="field">
              <label htmlFor="max-open">Max open per member</label>
              <input
                id="max-open"
                name="maxOpenLeads"
                className="input"
                type="number"
                min="1"
                defaultValue={settings.maxOpenLeads}
                disabled={!canManage}
              />
            </div>
            <div className="field">
              <label htmlFor="tz">Timezone</label>
              <input
                id="tz"
                name="timezone"
                className="input"
                defaultValue={settings.timezone}
                disabled={!canManage}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={!canManage || busy === 'timers'}>
            <Save size={15} aria-hidden="true" />
            Save
          </button>
        </form>
      </section>

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <span className="label-micro">Escalation ladder</span>
        <h3 style={{ marginTop: '0.25rem' }}>Who gets it, and when</h3>
        <p className="hint">
          Each step is an offset from the acknowledgement deadline, so 30 / 60 / 120 means exactly
          that.
        </p>

        <ul className="voice-log">
          {ladder.map((step, index) => (
            <li className="voice-turn" key={`${step.to}-${index}`}>
              <div className="btn-row" style={{ alignItems: 'center' }}>
                <span className="label-micro">Step {index + 1}</span>

                <input
                  className="input"
                  type="number"
                  min="0"
                  style={{ maxWidth: 110 }}
                  value={step.afterSeconds}
                  disabled={!canManage}
                  onChange={(event) => {
                    const next = ladder.map((entry, position) =>
                      position === index ? { ...entry, afterSeconds: Number(event.target.value) } : entry,
                    );

                    setSettings({ ...settings, escalation: next });
                  }}
                />
                <span className="hint">seconds after the deadline →</span>

                <select
                  className="select"
                  style={{ maxWidth: 240 }}
                  value={step.to}
                  disabled={!canManage}
                  onChange={(event) => {
                    const next = ladder.map((entry, position) =>
                      position === index ? { ...entry, to: event.target.value } : entry,
                    );

                    setSettings({ ...settings, escalation: next });
                  }}
                >
                  {TARGETS.map((target) => (
                    <option key={target.value} value={target.value}>
                      {target.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!canManage}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      escalation: ladder.filter((_, position) => position !== index),
                    })
                  }
                >
                  <Trash size={14} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!canManage}
            onClick={() => setSettings({ ...settings, escalation: [...ladder, { afterSeconds: 60, to: 'next' }] })}
          >
            <Plus size={14} aria-hidden="true" />
            Add a step
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canManage || busy === 'ladder'}
            onClick={() => run('ladder', () => workspaceApi.updateSettings(token, { escalation: ladder }), 'Ladder saved')}
          >
            <Save size={14} aria-hidden="true" />
            Save the ladder
          </button>
        </div>
      </section>

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <span className="label-micro">Pipeline</span>
        <h3 style={{ marginTop: '0.25rem' }}>The stages opportunities move through</h3>
        <p className="hint">
          Renaming keeps the stage&rsquo;s identity, so records follow it. A stage can be removed once
          nothing is left in it; the save is refused with the count if it is still in use. Closed
          stages stop the acknowledgement clock; a closed stage marked as won is what conversion and
          revenue count.
        </p>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Required before entry</th>
                <th scope="col">Closed</th>
                <th scope="col">Won</th>
                <th scope="col">Order</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {pipeline.map((stage, index) => (
                <tr key={stage.key || `new-${index}`}>
                  <td>
                    <input
                      className="input"
                      value={stage.label}
                      disabled={!canManage}
                      onChange={(event) =>
                        setPipeline(
                          pipeline.map((entry, position) =>
                            position === index ? { ...entry, label: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                    <span className="hint">
                      key: <code>{stage.key || '(generated from the label)'}</code>
                    </span>
                  </td>
                  <td>
                    <div className="btn-row" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
                      {REQUIRABLE.map((field) => (
                        <label key={field.key} className="hint" style={{ display: 'inline-flex', gap: '0.25rem' }}>
                          <input
                            type="checkbox"
                            checked={(stage.required ?? []).includes(field.key)}
                            disabled={!canManage}
                            onChange={(event) =>
                              setPipeline(
                                pipeline.map((entry, position) =>
                                  position === index
                                    ? {
                                        ...entry,
                                        required: event.target.checked
                                          ? [...(entry.required ?? []), field.key]
                                          : (entry.required ?? []).filter((key) => key !== field.key),
                                      }
                                    : entry,
                                ),
                              )
                            }
                          />
                          {field.label}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(stage.isClosed)}
                      disabled={!canManage}
                      onChange={(event) =>
                        setPipeline(
                          pipeline.map((entry, position) =>
                            position === index
                              ? {
                                  ...entry,
                                  isClosed: event.target.checked,
                                  isWon: event.target.checked ? Boolean(entry.isWon) : false,
                                }
                              : entry,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(stage.isWon)}
                      disabled={!canManage || !stage.isClosed}
                      onChange={(event) =>
                        setPipeline(
                          pipeline.map((entry, position) =>
                            position === index ? { ...entry, isWon: event.target.checked } : entry,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <div className="btn-row" style={{ gap: '0.2rem' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={!canManage || index === 0}
                        onClick={() => {
                          const next = [...pipeline];
                          [next[index - 1], next[index]] = [next[index], next[index - 1]];
                          setPipeline(next);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={!canManage || index === pipeline.length - 1}
                        onClick={() => {
                          const next = [...pipeline];
                          [next[index + 1], next[index]] = [next[index], next[index + 1]];
                          setPipeline(next);
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!canManage || pipeline.length <= 1}
                      onClick={() => setPipeline(pipeline.filter((_, position) => position !== index))}
                    >
                      <Trash size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="btn-row" style={{ marginTop: '0.5rem', alignItems: 'center' }}>
          <input
            className="input"
            style={{ maxWidth: 220 }}
            placeholder="New stage name"
            value={newStage.label}
            disabled={!canManage}
            onChange={(event) => setNewStage({ ...newStage, label: event.target.value })}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!canManage || newStage.label.trim().length < 2}
            onClick={() => {
              setPipeline([...pipeline, { ...newStage, label: newStage.label.trim(), key: '' }]);
              setNewStage(EMPTY_STAGE);
            }}
          >
            <Plus size={14} aria-hidden="true" />
            Add stage
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canManage || busy === 'pipeline'}
            onClick={() => run('pipeline', () => workspaceApi.updateSettings(token, { pipeline }), 'Pipeline saved')}
          >
            <Save size={14} aria-hidden="true" />
            Save stages
          </button>
        </div>
      </section>

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <span className="label-micro">Custom fields</span>
        <h3 style={{ marginTop: '0.25rem' }}>Extra fields on every opportunity</h3>
        <p className="hint">
          These appear on the new-lead form and the lead page, and the server checks the type,
          options and required flag on every save — a browser cannot bypass them.
        </p>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">Type</th>
                <th scope="col">Options</th>
                <th scope="col">Required</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.key || `field-${index}`}>
                  <td>
                    <input
                      className="input"
                      value={field.label}
                      disabled={!canManage}
                      onChange={(event) =>
                        setFields(
                          fields.map((entry, position) =>
                            position === index ? { ...entry, label: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                    <span className="hint">
                      key: <code>{field.key || '(generated from the label)'}</code>
                    </span>
                  </td>
                  <td>
                    <select
                      className="select"
                      value={field.type}
                      disabled={!canManage}
                      onChange={(event) =>
                        setFields(
                          fields.map((entry, position) =>
                            position === index ? { ...entry, type: event.target.value } : entry,
                          ),
                        )
                      }
                    >
                      {FIELD_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {field.type === 'dropdown' ? (
                      <input
                        className="input"
                        placeholder="one, two, three"
                        value={Array.isArray(field.options) ? field.options.join(', ') : field.options}
                        disabled={!canManage}
                        onChange={(event) =>
                          setFields(
                            fields.map((entry, position) =>
                              position === index
                                ? {
                                    ...entry,
                                    options: event.target.value
                                      .split(',')
                                      .map((option) => option.trim())
                                      .filter(Boolean),
                                  }
                                : entry,
                            ),
                          )
                        }
                      />
                    ) : (
                      <span className="hint">—</span>
                    )}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(field.required)}
                      disabled={!canManage}
                      onChange={(event) =>
                        setFields(
                          fields.map((entry, position) =>
                            position === index ? { ...entry, required: event.target.checked } : entry,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!canManage}
                      onClick={() => setFields(fields.filter((_, position) => position !== index))}
                    >
                      <Trash size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="btn-row" style={{ marginTop: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ maxWidth: 200 }}
            placeholder="New field label"
            value={newField.label}
            disabled={!canManage}
            onChange={(event) => setNewField({ ...newField, label: event.target.value })}
          />
          <select
            className="select"
            style={{ maxWidth: 140 }}
            value={newField.type}
            disabled={!canManage}
            onChange={(event) => setNewField({ ...newField, type: event.target.value })}
          >
            {FIELD_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          {newField.type === 'dropdown' ? (
            <input
              className="input"
              style={{ maxWidth: 200 }}
              placeholder="one, two, three"
              value={newField.options}
              disabled={!canManage}
              onChange={(event) => setNewField({ ...newField, options: event.target.value })}
            />
          ) : null}
          <label className="hint" style={{ display: 'inline-flex', gap: '0.3rem' }}>
            <input
              type="checkbox"
              checked={newField.required}
              disabled={!canManage}
              onChange={(event) => setNewField({ ...newField, required: event.target.checked })}
            />
            Required
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!canManage || newField.label.trim().length < 2}
            onClick={() => {
              setFields([
                ...fields,
                {
                  ...newField,
                  label: newField.label.trim(),
                  key: '',
                  options:
                    newField.type === 'dropdown'
                      ? newField.options.split(',').map((option) => option.trim()).filter(Boolean)
                      : [],
                },
              ]);
              setNewField(EMPTY_FIELD);
            }}
          >
            <Plus size={14} aria-hidden="true" />
            Add field
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canManage || busy === 'fields'}
            onClick={() => run('fields', () => workspaceApi.updateSettings(token, { customFields: fields }), 'Fields saved')}
          >
            <Save size={14} aria-hidden="true" />
            Save fields
          </button>
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section__title">Roles and permissions</h2>
        <p className="hint">
          A role is a bundle of permissions. An attached role replaces the level&rsquo;s defaults, so a
          Member with a Manager role holds exactly what that role lists. The owner always holds
          everything.
        </p>

        {canManage ? (
          <form
            className="card"
            style={{ marginBottom: '1rem' }}
            onSubmit={(event) => {
              event.preventDefault();

              void run(
                'create-role',
                async () => {
                  await workspaceApi.createRole(token, {
                    name: newRole.name,
                    permissions: newRole.permissions,
                  });
                  setNewRole({ name: '', permissions: ['crm.view'] });
                },
                'Role created',
              );
            }}
          >
            <span className="label-micro">New role</span>

            <div className="field" style={{ marginTop: '0.5rem' }}>
              <label htmlFor="role-name">Name</label>
              <input
                id="role-name"
                className="input"
                placeholder="Manager"
                value={newRole.name}
                onChange={(event) => setNewRole({ ...newRole, name: event.target.value })}
                required
              />
            </div>

            {Object.entries(groups).map(([group, permissions]) => (
              <div key={group} style={{ marginBottom: '0.5rem' }}>
                <span className="label-micro">{group}</span>
                <div className="btn-row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  {permissions.map((permission) => (
                    <label key={permission.key} className="hint" style={{ display: 'inline-flex', gap: '0.3rem' }}>
                      <input
                        type="checkbox"
                        checked={newRole.permissions.includes(permission.key)}
                        onChange={(event) =>
                          setNewRole({
                            ...newRole,
                            permissions: event.target.checked
                              ? [...newRole.permissions, permission.key]
                              : newRole.permissions.filter((key) => key !== permission.key),
                          })
                        }
                      />
                      {permission.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <button type="submit" className="btn btn-primary btn-sm" disabled={busy === 'create-role'}>
              <Plus size={14} aria-hidden="true" />
              Create the role
            </button>
          </form>
        ) : null}

        {roles.length === 0 ? (
          <p className="hint">No custom roles yet. A Member holds their level&rsquo;s defaults.</p>
        ) : (
          roles.map((role) => (
            <article className="card" key={role.id} style={{ marginBottom: '0.75rem' }}>
              <div className="pay-panel__head">
                <div>
                  <span className="label-micro">Role</span>
                  <h3 style={{ margin: '0.25rem 0 0' }}>{role.name}</h3>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy === role.id}
                    onClick={() => run(role.id, () => workspaceApi.removeRole(token, role.id), 'Role deleted')}
                  >
                    <Trash size={14} aria-hidden="true" />
                    Delete
                  </button>
                ) : null}
              </div>

              <div className="btn-row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                {catalog.map((permission) => {
                  const held = (role.permissions ?? []).includes(permission.key);

                  return (
                    <label key={permission.key} className="hint" style={{ display: 'inline-flex', gap: '0.3rem' }}>
                      <input
                        type="checkbox"
                        checked={held}
                        disabled={!canManage || busy === role.id}
                        onChange={(event) =>
                          run(
                            role.id,
                            () =>
                              workspaceApi.updateRole(token, role.id, {
                                permissions: event.target.checked
                                  ? [...(role.permissions ?? []), permission.key]
                                  : (role.permissions ?? []).filter((key) => key !== permission.key),
                              }),
                            `${role.name} updated`,
                          )
                        }
                      />
                      {permission.key}
                    </label>
                  );
                })}
              </div>
            </article>
          ))
        )}
      </section>

      <section className="dash-section">
        <h2 className="dash-section__title">Members</h2>

        {canManage ? (
          <form
            className="card"
            style={{ marginBottom: '1rem' }}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.target);

              void run(
                'invite',
                async () => {
                  await workspaceApi.inviteMember(token, {
                    email: data.get('email'),
                    level: data.get('level'),
                    roleId: data.get('roleId') || null,
                  });
                  event.target.reset();
                },
                'Member invited',
              );
            }}
          >
            <span className="label-micro">Invite someone</span>
            <p className="hint">
              Accounts are created with Google, so they sign in once and you add that address here.
            </p>

            <div className="grid grid-3">
              <div className="field">
                <label htmlFor="invite-email">Email address</label>
                <input id="invite-email" name="email" className="input" type="email" required />
              </div>
              <div className="field">
                <label htmlFor="invite-level">Level</label>
                <select id="invite-level" name="level" className="select" defaultValue="user">
                  {levels.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="invite-role">Role</label>
                <select id="invite-role" name="roleId" className="select" defaultValue="">
                  <option value="">Level defaults</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-sm" disabled={busy === 'invite'}>
              <Plus size={14} aria-hidden="true" />
              Send the invite
            </button>
          </form>
        ) : null}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Level</th>
                <th scope="col">Role</th>
                <th scope="col">Open limit</th>
                <th scope="col">Backup</th>
                <th scope="col">Available</th>
                <th scope="col">Effective permissions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <th scope="row">
                    {member.name}
                    <br />
                    <span className="hint">{member.email}</span>
                  </th>
                  <td>
                    <select
                      className="select"
                      value={member.level}
                      disabled={!canManage}
                      onChange={(event) =>
                        run(member.id, () =>
                          workspaceApi.updateMember(token, member.id, { level: event.target.value }),
                        )
                      }
                    >
                      {levels.map((level) => (
                        <option key={level.value} value={level.value}>
                          {level.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="select"
                      value={member.roleId ?? ''}
                      disabled={!canManage}
                      onChange={(event) =>
                        run(member.id, () =>
                          workspaceApi.updateMember(token, member.id, { roleId: event.target.value || null }),
                        )
                      }
                    >
                      <option value="">Level defaults</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      style={{ maxWidth: 90 }}
                      defaultValue={member.openLeadLimit ?? settings.maxOpenLeads}
                      disabled={!canManage}
                      onBlur={(event) => {
                        const value = Number(event.target.value);

                        if (value !== member.openLeadLimit) {
                          void run(member.id, () =>
                            workspaceApi.updateMember(token, member.id, { openLeadLimit: value }),
                          );
                        }
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(member.backup)}
                      disabled={!canManage}
                      onChange={(event) =>
                        run(member.id, () =>
                          workspaceApi.updateMember(token, member.id, { backup: event.target.checked }),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(member.available)}
                      disabled={!canManage}
                      onChange={(event) =>
                        run(member.id, () =>
                          workspaceApi.updateMember(token, member.id, { available: event.target.checked }),
                        )
                      }
                    />
                  </td>
                  <td>
                    <span className="hint">{member.permissions?.length ?? 0} of {catalog.length}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="hint">
          Round-robin only considers available members under their limit. Setting someone
          unavailable stops new work reaching them.
        </p>
      </section>
    </>
  );
}
