import { useEffect, useState } from 'react';
import { deployStatus } from './api.js';

const POLL_MS = 2000;

/**
 * Live deployment state. Returns null only until the first successful response;
 * a failed poll keeps the previous value, because the API genuinely goes away for a
 * moment in the middle of a deploy.
 */
export function useDeployStatus() {
  const [status, setStatus] = useState(null);

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

  return status;
}

/** A clock that ticks only while something is running, for the elapsed timer. */
export function useNow(active) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return undefined;

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [active]);

  return now;
}
