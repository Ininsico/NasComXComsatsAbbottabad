import DeployPanel from './DeployPanel.jsx';
import { useDeployStatus, useNow } from '../lib/useDeployStatus.js';

/**
 * Takes over the screen while a deployment is replacing the stack, so it is impossible
 * to be looking at a stale page and wondering whether anything is happening. Renders
 * nothing at all when no deployment is running.
 */
export default function DeployOverlay() {
  const status = useDeployStatus();
  const now = useNow(status?.inProgress === true);

  if (!status?.inProgress) return null;

  return (
    <div className="deploy-overlay" role="dialog" aria-modal="true" aria-label="Deployment in progress">
      <div className="deploy-overlay__card">
        <DeployPanel status={status} now={now} />
      </div>
    </div>
  );
}
