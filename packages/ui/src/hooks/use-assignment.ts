import type {
  Assignment,
  AssignmentId,
  AssignmentSubmissionResult,
  ConfidenceBand,
} from "@praxis/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

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
  /** Map<itemId, ConfidenceBand> — confidence selection per item (quiz mode). */
  confidences: Map<string, ConfidenceBand>;
  loading: boolean;
  error: string | null;
  submitting: boolean;
  submitError: string | null;
  recordResponse: (itemId: string, response: string, work?: string) => void;
  /** Record a confidence-band selection for a specific item. Persisted on save/submit. */
  recordConfidence: (itemId: string, confidence: ConfidenceBand) => void;
  submit: () => Promise<AssignmentSubmissionResult | null>;
  refresh: () => Promise<void>;
}

interface AssignmentData {
  assignment: Assignment | null;
  responses: Map<string, string>;
  work: Map<string, string>;
  confidences: Map<string, ConfidenceBand>;
}

export function useAssignment(assignmentId: AssignmentId | undefined): UseAssignmentResult {
  const client = usePraxisClient();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Debounce timers: Map<itemId, ReturnType<typeof setTimeout>>
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const loader = useCallback(async (): Promise<AssignmentData> => {
    if (!assignmentId) {
      return {
        assignment: null,
        responses: new Map(),
        work: new Map(),
        confidences: new Map(),
      };
    }
    const [a, savedResponses] = await Promise.all([
      client.assignments.get({ assignmentId }),
      client.assignments.getResponses({ assignmentId }),
    ]);

    const responses = new Map<string, string>();
    const work = new Map<string, string>();
    const confidences = new Map<string, ConfidenceBand>();
    for (const r of savedResponses) {
      responses.set(r.itemId, r.response);
      if (r.work !== undefined) {
        work.set(r.itemId, r.work);
      }
      if (r.confidence !== undefined) {
        confidences.set(r.itemId, r.confidence);
      }
    }
    return { assignment: a, responses, work, confidences };
  }, [client, assignmentId]);

  const { data, loading, error, refresh, setData } = useResource(loader);

  const assignment = data?.assignment ?? null;
  const responses = data?.responses ?? new Map<string, string>();
  const work = data?.work ?? new Map<string, string>();
  const confidences = data?.confidences ?? new Map<string, ConfidenceBand>();

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
      setData((prev) => {
        const prevData = prev ?? {
          assignment: null,
          responses: new Map(),
          work: new Map(),
          confidences: new Map(),
        };
        const newResponses = new Map(prevData.responses);
        newResponses.set(itemId, response);
        const newWork = workText !== undefined ? new Map(prevData.work) : prevData.work;
        if (workText !== undefined) {
          newWork.set(itemId, workText);
        }
        return { ...prevData, responses: newResponses, work: newWork };
      });

      // Debounce the remote save (1s)
      const existing = debounceTimers.current.get(itemId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        if (!assignmentId) return;
        // Include the current confidence value if already selected.
        const currentConfidence = confidences.get(itemId);
        client.assignments
          .recordResponse({
            assignmentId,
            itemId,
            response,
            ...(workText !== undefined && { work: workText }),
            ...(currentConfidence !== undefined && { confidence: currentConfidence }),
          })
          .catch(() => {
            // Non-fatal: auto-save failures are silent; explicit submit is the source of truth
          });
        debounceTimers.current.delete(itemId);
      }, 1000);

      debounceTimers.current.set(itemId, timer);
    },
    [client, assignmentId, setData, confidences],
  );

  const recordConfidence = useCallback(
    (itemId: string, confidence: ConfidenceBand) => {
      // Optimistic local update
      setData((prev) => {
        const prevData = prev ?? {
          assignment: null,
          responses: new Map(),
          work: new Map(),
          confidences: new Map(),
        };
        const newConfidences = new Map(prevData.confidences);
        newConfidences.set(itemId, confidence);
        return { ...prevData, confidences: newConfidences };
      });

      // Persist immediately — confidence selection is a lightweight write.
      if (assignmentId) {
        const currentResponse = responses.get(itemId) ?? "";
        const currentWork = work.get(itemId);
        client.assignments
          .recordResponse({
            assignmentId,
            itemId,
            response: currentResponse,
            ...(currentWork !== undefined && { work: currentWork }),
            confidence,
          })
          .catch(() => {
            // Non-fatal
          });
      }
    },
    [client, assignmentId, responses, work, setData],
  );

  const submit = useCallback(async (): Promise<AssignmentSubmissionResult | null> => {
    if (!assignmentId) return null;

    // Flush all pending debounced saves before submitting (include confidence if set).
    for (const [itemId, timer] of debounceTimers.current) {
      clearTimeout(timer);
      const response = responses.get(itemId) ?? "";
      const workText = work.get(itemId);
      const confidenceValue = confidences.get(itemId);
      await client.assignments
        .recordResponse({
          assignmentId,
          itemId,
          response,
          ...(workText !== undefined && { work: workText }),
          ...(confidenceValue !== undefined && { confidence: confidenceValue }),
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
  }, [assignmentId, client, responses, work, confidences, refresh]);

  return {
    assignment,
    responses,
    work,
    confidences,
    loading,
    error,
    submitting,
    submitError,
    recordResponse,
    recordConfidence,
    submit,
    refresh,
  };
}
