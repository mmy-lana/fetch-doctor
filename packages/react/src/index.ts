import { useEffect, useState, useRef, useCallback } from 'react';
import {
  initFetchDoctor,
  subscribeDiagnostics,
  getDiagnostics,
  getNetworkLogs,
} from '@fetch-doctor/core';
import {
  FetchDoctorConfig,
  DiagnosticSummary,
  NetworkRequestLog,
} from '@fetch-doctor/shared';
import { registerFetchScope, unregisterFetchScope } from '@fetch-doctor/core';

export function useFetchDoctor(config?: FetchDoctorConfig): void {
  // Keep the caller's config object intact (functions, RegExp, objects).
  // Serializing through JSON here used to drop `onIssueDetected` and turn
  // RegExp ignore patterns into plain objects, which made every fetch throw
  // `pattern.test is not a function`.
  const configRef = useRef<FetchDoctorConfig | undefined>(config);
  configRef.current = config;

  // Re-apply only when the config *values* change. Function and RegExp
  // identities are excluded so inline callbacks do not re-init every render.
  const valueKey = config
    ? JSON.stringify([
        config.enableOverlay ?? null,
        config.overlayPosition ?? null,
        config.maxLogs ?? null,
        config.rules ?? null,
        (config.ignoreUrls ?? []).map((p) => (typeof p === 'string' ? p : String(p))),
      ])
    : '';

  useEffect(() => {
    initFetchDoctor(configRef.current);
  }, [valueKey]);
}

export function useFetchDoctorDiagnostics(): {
  logs: NetworkRequestLog[];
  summary: DiagnosticSummary;
} {
  const [data, setData] = useState<{
    logs: NetworkRequestLog[];
    summary: DiagnosticSummary;
  }>(() => ({
    logs: typeof window !== 'undefined' ? getNetworkLogs() : [],
    summary: typeof window !== 'undefined' ? getDiagnostics() : {
      totalRequests: 0,
      zombieFetches: 0,
      missingAbortSignals: 0,
      slowResponses: 0,
      httpErrors: 0,
      score: 100,
      issues: [],
    },
  }));

  useEffect(() => {
    return subscribeDiagnostics((logs: NetworkRequestLog[], summary: DiagnosticSummary) => {
      setData({ logs, summary });
    });
  }, []);

  return data;
}

export function useTrackFetch(componentName = 'Component') {
  const abortControllersRef = useRef<Set<AbortController>>(new Set());

  useEffect(() => {
    const scopeId = registerFetchScope(componentName);
    const controllers = abortControllersRef.current;
    return () => {
      const signals = new Set<AbortSignal>();
      controllers.forEach((controller) => {
        if (!controller.signal.aborted) {
          controller.abort('Component unmounted');
          signals.add(controller.signal);
        }
      });
      unregisterFetchScope(scopeId, signals);
      controllers.clear();
    };
  }, [componentName]);

  const trackedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const controller = new AbortController();
      abortControllersRef.current.add(controller);

      let signal = controller.signal;
      if (init?.signal) {
        if (typeof AbortSignal.any === 'function') {
          signal = AbortSignal.any([controller.signal, init.signal]);
        } else {
          const customSignal = init.signal;
          if (customSignal.aborted) {
            controller.abort();
          } else {
            customSignal.addEventListener('abort', () => controller.abort(), { once: true });
          }
        }
      }

      try {
        const response = await fetch(input, { ...init, signal });
        abortControllersRef.current.delete(controller);
        return response;
      } catch (error) {
        abortControllersRef.current.delete(controller);
        throw error;
      }
    },
    []
  );

  return trackedFetch;
}

export * from '@fetch-doctor/core';
export * from '@fetch-doctor/shared';