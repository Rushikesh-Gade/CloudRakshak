/**
 * useApi.js
 *
 * Generic data-fetching hook used by all dashboard components.
 * Handles loading, error, and data states consistently.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useApi('/api/summary');
 */

import { useState, useEffect, useCallback } from 'react';

export function useApi(url) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      setData(json.data ?? json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
