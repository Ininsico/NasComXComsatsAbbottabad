import { CloudUpload, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deployStatus } from '../lib/api.js';

const POLL_MS = 8000;

/**
 * Shows a brief animated bar while the deploy pipeline is replacing the stack.
 *
 * The API can genuinely be unreachable for a few seconds in the middle of a deploy,
 * so a failed poll keeps the last known state instead of flickering the bar away.
 * Renders nothing at all when no deployment is running.
 */
export default function DeployBanner() {
  const [status, setStatus] = useState({ inProgress: false });

  useEffect(() => {
    let active = true;

    const poll = async () => {
      const next = await deployStatus();

      if (active && next) setStatus(next);
    };

    void poll();
    const timer = setInterval(poll, POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!status.inProgress) return null;

  const percent = Math.max(0, Math.min(100, status.percent ?? 0));

  return (
    <Link className="deploy-banner" to="/deploy" role="status" aria-live="polite">
      <span className="deploy-banner__sweep" aria-hidden="true" />
      <span className="deploy-banner__label">
        <LoaderCircle size={14} className="deploy-banner__spin" aria-hidden="true" />
        <CloudUpload size={14} aria-hidden="true" />
        <span>
          {status.stageLabel ?? 'Deploying'} — {percent}% · the site may blink for a moment
        </span>
      </span>
      <span className="deploy-banner__bar" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </span>
    </Link>
  );
}
