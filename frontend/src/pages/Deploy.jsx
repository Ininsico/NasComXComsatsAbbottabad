import { LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import DeployPanel from '../components/DeployPanel.jsx';
import { useDeployStatus, useNow } from '../lib/useDeployStatus.js';

/**
 * Always-reachable view of the deployment state: the same panel the overlay shows
 * while a deploy runs, plus a way back to the site.
 */
export default function Deploy() {
  const status = useDeployStatus();
  const now = useNow(status?.inProgress === true);

  if (!status) {
    return (
      <section className="deploy-page">
        <div className="deploy-overlay__card">
          <p className="hint">
            <LoaderCircle size={16} className="spin" aria-hidden="true" /> Checking whether a
            deployment is running…
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="deploy-page">
      <div className="deploy-overlay__card">
        <DeployPanel status={status} now={now} />

        <p className="hint deploy-panel__footer">
          This page refreshes every couple of seconds. <Link to="/">Back to the site</Link>
        </p>
      </div>
    </section>
  );
}
