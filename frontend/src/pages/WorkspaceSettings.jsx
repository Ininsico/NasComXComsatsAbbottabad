import { CircleCheckBig, Plus, Save, Trash } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { workspaceApi } from '../lib/api.js';

const TARGETS = [
  { value: 'next', label: 'Next available rep' },
  { value: 'backup', label: 'Backup member' },
  { value: 'manager', label: 'Manager (admin or owner)' },
];

export default function WorkspaceSettings() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [workspace, setWorkspace] = useState(null);
  const [settings, setSettings] = useState(null);
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(() => workspaceApi.get(token), [token]);

  const apply = useCallback((payload) => {
    setWorkspace(payload.workspace);
    setMembers(payload.members ?? []);
    setSettings(payload.settings);
  }, []);

  const refresh = useCallback(
    () =>
      fetchAll()
        .then(apply)
        .catch((refreshError) =>
          showToast({ tone: 'error', title: 'Could not load the workspace', message: refreshError.message }),
        ),
    [fetchAll, apply, showToast],
  );

  useEffect(() => {
    let active = true;

    fetchAll()
      .then((payload) => {
        if (active) apply(payload);
      })
      .catch((loadError) => {
        if (active) {
          showToast({ tone: 'error', title: 'Could not load the workspace', message: loadError.message });
        }
      });

    return () => {
      active = false;
    };
  }, [fetchAll, apply, showToast]);

  async function save(patch) {
    setBusy(true);

    try {
      const payload = await workspaceApi.updateSettings(token, { ...settings, ...patch });

      setSettings(payload.settings);
      showToast({ tone: 'success', title: 'Settings saved' });
    } catch (error) {
      showToast({ tone: 'error', title: 'Could not save', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function patchMember(id, patch) {
    try {
      await workspaceApi.updateMember(token, id, patch);
      await refresh();
    } catch (error) {
      showToast({ tone: 'error', title: 'Could not update the member', message: error.message });
    }
  }

  if (!settings) return <p className="hint">Loading settingsâ€¦</p>;

  const ladder = settings.escalation ?? [];

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Workspace settings</h1>
          <p>{workspace?.name} Â· the timers here are what the server enforces</p>
        </div>
      </div>

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <span className="label-micro">Acknowledgement</span>
        <h3 style={{ marginTop: '0.25rem' }}>How long a lead may sit unanswered</h3>

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.target);

            void save({
              acknowledgeSeconds: Number(data.get('acknowledgeSeconds')),
              maxOpenLeads: Number(data.get('maxOpenLeads')),
              timezone: data.get('timezone'),
            });
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
              />
            </div>
            <div className="field">
              <label htmlFor="max-open">Max open leads per member</label>
              <input
                id="max-open"
                name="maxOpenLeads"
                className="input"
                type="number"
                min="1"
                defaultValue={settings.maxOpenLeads}
              />
            </div>
            <div className="field">
              <label htmlFor="tz">Timezone</label>
              <input id="tz" name="timezone" className="input" defaultValue={settings.timezone} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Save size={15} aria-hidden="true" />
            Save
          </button>
        </form>
      </section>

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <span className="label-micro">Escalation ladder</span>
        <h3 style={{ marginTop: '0.25rem' }}>Who gets it, and when</h3>
        <p className="hint">
          Each step is an offset from the acknowledgement deadline, so 30 / 60 / 120 means exactly that.
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
                  onChange={(event) => {
                    const next = ladder.map((entry, position) =>
                      position === index ? { ...entry, afterSeconds: Number(event.target.value) } : entry,
                    );
                    setSettings({ ...settings, escalation: next });
                  }}
                />
                <span className="hint">seconds after the deadline â†’</span>

                <select
                  className="select"
                  style={{ maxWidth: 220 }}
                  value={step.to}
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
                  onClick={() => setSettings({ ...settings, escalation: ladder.filter((_, position) => position !== index) })}
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
            onClick={() =>
              setSettings({
                ...settings,
                escalation: [...ladder, { afterSeconds: 60, to: 'next' }],
              })
            }
          >
            <Plus size={14} aria-hidden="true" />
            Add a step
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => save({ escalation: ladder })}
          >
            <Save size={14} aria-hidden="true" />
            Save the ladder
          </button>
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section__title">Members</h2>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Level</th>
                <th scope="col">Open limit</th>
                <th scope="col">Backup</th>
                <th scope="col">Available</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.name}</strong>
                    <br />
                    <span className="hint">{member.email}</span>
                  </td>
                  <td>{member.levelLabel}</td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      style={{ maxWidth: 90 }}
                      defaultValue={member.openLeadLimit ?? settings.maxOpenLeads}
                      onBlur={(event) => {
                        const value = Number(event.target.value);

                        if (value !== member.openLeadLimit) void patchMember(member.id, { openLeadLimit: value });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(member.backup)}
                      onChange={(event) => void patchMember(member.id, { backup: event.target.checked })}
                    />
                  </td>
                  <td>
                    <label className="hint" style={{ display: 'inline-flex', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(member.available)}
                        onChange={(event) => void patchMember(member.id, { available: event.target.checked })}
                      />
                      {member.available ? (
                        <CircleCheckBig size={14} aria-hidden="true" />
                      ) : null}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="hint">
          Round-robin only considers available members under their limit. A new member is due first.
        </p>
      </section>
    </>
  );
}
