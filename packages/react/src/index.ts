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

export function useFetchDoctor(config?: FetchDoctorConfig): void {
  useEffect(() => {
    initFetchDoctor(config);
  }, [config]);
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

export function useTrackFetch() {
  const abortControllersRef = useRef<Set<AbortController>>(new Set());

  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      controllers.forEach((controller) => {
        if (!controller.signal.aborted) {
          controller.abort('Component unmounted');
        }
      });
      controllers.clear();
    };
  }, []);

  const trackedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const controller = new AbortController();
      abortControllersRef.current.add(controller);

      let signal = controller.signal;
      if (init?.signal) {
        const customSignal = init.signal;
        if (customSignal.aborted) {
          controller.abort();
        } else {
          customSignal.addEventListener('abort', () => controller.abort(), { once: true });
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