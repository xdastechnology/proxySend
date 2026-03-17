import { useEffect, useRef, useCallback } from 'react';

const RECONNECT_DELAY = 3000;
const FALLBACK_POLL_INTERVAL = 10000;

export function useSSE(url, handlers, { enabled = true } = {}) {
  const esRef = useRef(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const startPolling = useCallback(
    (pollFn) => {
      if (!pollFn || pollRef.current) return;
      pollRef.current = setInterval(() => {
        if (mountedRef.current) pollFn();
      }, FALLBACK_POLL_INTERVAL);
    },
    []
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return;

    try {
      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;

      es.onopen = () => {
        stopPolling();
        if (handlersRef.current.onOpen) handlersRef.current.onOpen();
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (handlersRef.current.onError) handlersRef.current.onError();
        // Start fallback polling
        if (handlersRef.current.onPoll) {
          startPolling(handlersRef.current.onPoll);
        }
        // Try reconnect
        if (mountedRef.current) {
          setTimeout(connect, RECONNECT_DELAY);
        }
      };

      // Register event handlers
      const events = handlersRef.current.events || {};
      for (const [event, handler] of Object.entries(events)) {
        es.addEventListener(event, (e) => {
          if (!mountedRef.current) return;
          try {
            const data = JSON.parse(e.data);
            handler(data);
          } catch {
            handler(e.data);
          }
        });
      }
    } catch {
      if (handlersRef.current.onPoll) {
        startPolling(handlersRef.current.onPoll);
      }
    }
  }, [url, enabled, startPolling, stopPolling]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) connect();

    return () => {
      mountedRef.current = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      stopPolling();
    };
  }, [connect, enabled, stopPolling]);
}
