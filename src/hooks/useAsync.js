import { useEffect, useState } from 'react';

export function useAsync(load, deps = []) {
  const [state, setState] = useState({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: null }));

    load()
      .then((data) => {
        if (alive) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (alive) setState({ data: null, error, loading: false });
      });

    return () => {
      alive = false;
    };
  }, deps);

  return state;
}
