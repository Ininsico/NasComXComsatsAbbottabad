import { useCallback, useEffect, useState } from 'react';

/**
 * Loads a resource and exposes `{ data, error, loading, reload }`.
 *
 * `loader` must be referentially stable — a module-level function or wrapped in
 * `useCallback` — otherwise the effect will run on every render.
 */
export default function useApiResource(loader) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;

    loader()
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (active) setState({ data: null, error, loading: false });
      });

    return () => {
      active = false;
    };
  }, [loader, nonce]);

  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    setNonce((value) => value + 1);
  }, []);

  return { ...state, reload };
}
