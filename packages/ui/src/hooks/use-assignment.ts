import type { Assignment, AssignmentId, AssignmentSubmissionResult } from "@praxis/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

/**
 * Hook that manages assignment state: loading the assignment, tracking
 * per-item responses and work text, auto-saving (1s debounce), and submission.
 *
 * Phase 8: supports both regular response and workRubric "work" text.
 */
export interface UseAssignmentResult {
  assignment: Assignment | null;
  /** Map<itemId, responseText> — primary answer per item. */
  responses: Map<string, string>;
  /** Map<itemId, workText> — shown work per item (only for items with workRubric). */
  work: Map<string, string>;
  loading: boolean;
  error: string | null;
  submitting: boolean;
  submitError: string | null;
  recordResponse: (itemId: string, response: string, work?: string) => void;
  submit: () => Promise<AssignmentSubmissionResult | null>;
  refresh: () => Promise<void>;
}

export function useAssignment(assignmentId: AssignmentId | undefined): UseAssignmentResult {
  const client = usePraxisClient();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [responses, setResponses] = useState<Map<string, string>>(new Map());
  const [work, setWork] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Debounce timers: Map<itemId, ReturnType<typeof setTimeout>>
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const refresh = useCallback(async () => {
    if (!assignmentId) return;
    setLoading(true);
    setError(null);
    try {
      const [a, savedResponses] = await Promise.all([
        client.assignments.get({ assignmentId }),
        client.assignments.getResponses({ assignmentId }),
      ]);
      setAssignment(a);

      const newResponses = new Map<string, string>();
      const newWork = new Map<string, string>();
      for (const r of savedResponses) {
        newResponses.set(r.itemId, r.response);
        if (r.work !== undefined) {
          newWork.set(r.itemId, r.work);
        }
      }
      setResponses(newResponses);
      setWork(newWork);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, assignmentId]);

  // Load on mount / when assignmentId changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of debounceTimers.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const recordResponse = useCallback(
    (itemId: string, response: string, workText?: string) => {
      // Optimistic local update
      setResponses((prev) => {
        const next = new Map(prev);
        next.set(itemId, response);
        return next;
      });
      if (workText !== undefined) {
        setWork((prev) => {
          const next = new Map(prev);
          next.set(itemId, workText);
          return next;
        });
      }

      // Debounce the remote save (1s)
      const existing = debounceTimers.current.get(itemId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        if (!assignmentId) return;
        client.assignments
          .recordResponse({
            assignmentId,
            itemId,
            response,
            ...(workText !== undefined && { work: workText }),
          })
          .catch(() => {
            // Non-fatal: auto-save failures are silent; explicit submit is the source of truth
          });
        debounceTimers.current.delete(itemId);
      }, 1000);

      debounceTimers.current.set(itemId, timer);
    },
    [client, assignmentId],
  );

  const submit = useCallback(async (): Promise<AssignmentSubmissionResult | null> => {
    if (!assignmentId) return null;

    // Flush all pending debounced saves before submitting
    for (const [itemId, timer] of debounceTimers.current) {
      clearTimeout(timer);
      const response = responses.get(itemId) ?? "";
      const workText = work.get(itemId);
      await client.assignments
        .recordResponse({
          assignmentId,
          itemId,
          response,
          ...(workText !== undefined && { work: workText }),
        })
        .catch(() => {});
    }
    debounceTimers.current.clear();

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await client.assignments.submit({ assignmentId });
      // Refresh to get the updated assignment with grade
      await refresh();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [assignmentId, client, responses, work, refresh]);

  return {
    assignment,
    responses,
    work,
    loading,
    error,
    submitting,
    submitError,
    recordResponse,
    submit,
    refresh,
  };
}
