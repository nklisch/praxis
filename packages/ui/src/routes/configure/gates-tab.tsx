import type { CourseId, Gate, GateId, GateView, Lesson, SessionId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { Background, Controls, type Node, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConceptFlowNode, ConceptNodeData } from "../../components/concept-node.js";
import { ConceptNode } from "../../components/concept-node.js";
import type { GateEdgeLabelData } from "../../components/gate-edge-label.js";
import { GateEdgeLabel } from "../../components/gate-edge-label.js";
import { GateInspector } from "../../components/gate-inspector.js";
import { GatesReadingView } from "../../components/gates-reading-view.js";
import { useConceptNames } from "../../hooks/use-concept-names.js";
import { useConfigureState } from "../../hooks/use-configure-state.js";
import { useCourses } from "../../hooks/use-courses.js";
import { useDirtyState } from "../../hooks/use-dirty-state.js";
import { useGates } from "../../hooks/use-gates.js";
import styles from "./gates-tab.module.css";

/**
 * Gates tab — React Flow graph of lesson gates for a selected course.
 *
 * No RouteHeader: this is a tab panel inside <ConfigureRoute>, not a standalone route.
 * The parent route owns the header (configure.tsx renders <RouteHeader>).
 */

const NODE_WIDTH = 160;
const NODE_HEIGHT = 70;

// biome-ignore lint/suspicious/noExplicitAny: React Flow registries use ComponentType<any>
const NODE_TYPES: Record<string, React.ComponentType<any>> = { concept: ConceptNode };
// biome-ignore lint/suspicious/noExplicitAny: React Flow edge registries use ComponentType<any>
const EDGE_TYPES: Record<string, React.ComponentType<any>> = { gateEdge: GateEdgeLabel };

interface GatesTabProps {
  sessionId: SessionId | null;
}

/**
 * Gates tab canvas — React Flow graph of lesson gates for a selected course.
 *
 * The chat pane has been promoted to the Configure shell (configure.tsx) and is
 * now a shared side panel. This component is canvas-only.
 *
 * Click a gate edge label (or concept node adjacent to a gate) → opens GateInspector.
 * Inspector: edit mastery threshold, override, delete.
 *
 * `sessionId` is threaded through for future sub-surface canvas features that
 * may want to correlate canvas interactions with the active configure session.
 */
export function GatesTab({ sessionId: _sessionId }: GatesTabProps) {
  const { selectedCourseId, setSelectedCourseId, setSelectedGate: setContextSelectedGate } =
    useConfigureState();

  // Register this tab with the cross-tab dirty tracker.
  // markDirty is called when the user edits a threshold in GateInspector;
  // markClean is called after a save completes.
  const { markDirty, markClean } = useDirtyState("configure.gates");

  const { courses, loading: coursesLoading } = useCourses();

  const {
    data: gatesData,
    loading,
    error,
    refresh: loadData,
    setData: setGatesData,
  } = useGates(selectedCourseId ?? undefined);

  const lessons: Lesson[] = gatesData?.lessons ?? [];
  const gateViews: GateView[] = gatesData?.gateViews ?? [];
  const gates: Gate[] = gatesData?.gates ?? [];

  // Local selected gate state (tab-internal; also written to context for inspector strip).
  const [selectedGate, setSelectedGate] = useState<Gate | null>(null);

  // Track gate IDs whose thresholds have been edited but not yet saved.
  // A gate's id is present here when the user has started editing its threshold
  // in GateInspector (which edits the field) but hasn't confirmed the save.
  const [dirtyGateIds, setDirtyGateIds] = useState<ReadonlySet<GateId>>(new Set());

  // Keep context inspector strip in sync with the local selection + dirty state.
  useEffect(() => {
    if (!selectedGate) {
      setContextSelectedGate(null);
      return;
    }
    setContextSelectedGate({
      gate: selectedGate,
      pendingMinScore: dirtyGateIds.has(selectedGate.id)
        ? selectedGate.successCriteria.kind === "mastery-threshold"
          ? selectedGate.successCriteria.minScore
          : null
        : null,
    });
  }, [selectedGate, dirtyGateIds, setContextSelectedGate]);

  // Propagate aggregate dirty state to the cross-tab tracker.
  useEffect(() => {
    if (dirtyGateIds.size > 0) {
      markDirty();
    } else {
      markClean();
    }
  }, [dirtyGateIds, markDirty, markClean]);

  const { getName, getById } = useConceptNames(selectedCourseId ?? undefined);

  const getConceptForReadingView = useCallback(
    (id: string) => {
      const row = getById(id);
      if (!row) return null;
      return { name: row.name, description: row.description };
    },
    [getById],
  );

  const { nodes, edges } = useMemo(() => {
    if (lessons.length === 0) return { nodes: [], edges: [] };
    return buildGraph(lessons, gateViews, getName, dirtyGateIds);
  }, [lessons, gateViews, getName, dirtyGateIds]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Find a gate guarding this concept's lesson
      const conceptId = node.id.replace("concept-", "");
      const lesson = lessons.find((l) => l.conceptIds.includes(brandId<"ConceptId">(conceptId)));
      if (!lesson) return;
      const gate = gates.find(
        (g) =>
          g.guards.kind === "lesson" && (g.guards as { lessonId: string }).lessonId === lesson.id,
      );
      if (gate) setSelectedGate(gate);
    },
    [lessons, gates],
  );

  const handleGateSaved = (updated: Gate) => {
    setGatesData((prev) => {
      const base = prev ?? { lessons: [], gateViews: [], gates: [] };
      return { ...base, gates: base.gates.map((g) => (g.id === updated.id ? updated : g)) };
    });
    // Clear this gate's dirty flag — save confirmed.
    setDirtyGateIds((prev) => {
      const next = new Set(prev);
      next.delete(updated.id);
      return next;
    });
    setSelectedGate(updated);
    // Refresh gate views for the progress display
    loadData();
  };

  const handleGateDeleted = (gateId: GateId) => {
    setGatesData((prev) => {
      const base = prev ?? { lessons: [], gateViews: [], gates: [] };
      return { ...base, gates: base.gates.filter((g) => g.id !== gateId) };
    });
    setDirtyGateIds((prev) => {
      const next = new Set(prev);
      next.delete(gateId);
      return next;
    });
    setSelectedGate(null);
    loadData();
  };

  /**
   * Called by GateInspector when the user changes a threshold value in the form.
   * We mark this gate dirty immediately so the edge label turns warning-coloured.
   */
  const handleGateThresholdEdit = useCallback((gateId: GateId) => {
    setDirtyGateIds((prev) => {
      const next = new Set(prev);
      next.add(gateId);
      return next;
    });
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedGate(null);
    setContextSelectedGate(null);
  }, [setContextSelectedGate]);

  return (
    <div className={styles.layout}>
      <div className={styles.canvasPane}>
        <div className={styles.canvasHeader}>
          <h2 className={styles.title}>Gates Editor</h2>
          <label className={styles.pickerLabel}>
            Course
            <select
              className={styles.coursePicker}
              value={selectedCourseId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCourseId(val ? (val as CourseId) : null);
                setSelectedGate(null);
                setContextSelectedGate(null);
                setDirtyGateIds(new Set());
              }}
              disabled={coursesLoading}
            >
              <option value="">— Select a course —</option>
              {courses.map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && <p className={styles.status}>Loading gates…</p>}
        {error && <p className={styles.error}>{error}</p>}

        {!selectedCourseId && !loading && (
          <div className={styles.emptyState}>
            <p>Select a course to view and edit its gate graph.</p>
          </div>
        )}

        {selectedCourseId && !loading && !error && (
          <div className={styles.canvasAndInspector}>
            <div className={styles.canvasAndReading}>
              <div className={styles.canvas}>
                {nodes.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No concepts yet. Add lessons to see the gate graph.</p>
                  </div>
                ) : (
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={NODE_TYPES}
                    edgeTypes={EDGE_TYPES}
                    onNodeClick={handleNodeClick}
                    onPaneClick={handlePaneClick}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    minZoom={0.2}
                    maxZoom={2}
                  >
                    <Background />
                    <Controls />
                  </ReactFlow>
                )}
              </div>

              <GatesReadingView
                lessons={lessons}
                gateViews={gateViews}
                gates={gates}
                getConcept={getConceptForReadingView}
                selectedGateId={selectedGate?.id ?? null}
                onSelectGate={setSelectedGate}
              />
            </div>

            {selectedGate && (
              <GateInspector
                gate={selectedGate}
                allGates={gates}
                onSaved={handleGateSaved}
                onDeleted={handleGateDeleted}
                onThresholdEdit={handleGateThresholdEdit}
                onClose={() => {
                  setSelectedGate(null);
                  setContextSelectedGate(null);
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Graph builder (mirrors course-map.tsx but simplified) ─────────────────────

function buildGraph(
  lessons: Lesson[],
  gates: GateView[],
  getName: (id: string) => string,
  dirtyGateIds: ReadonlySet<GateId> = new Set(),
): { nodes: ConceptFlowNode[]; edges: import("@xyflow/react").Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80, marginx: 20, marginy: 20 });

  const nodes: ConceptFlowNode[] = [];
  const edges: import("@xyflow/react").Edge[] = [];
  const lessonAnchors: Array<{ first: string; last: string }> = [];

  for (const lesson of lessons) {
    const gateView = gates.find(
      (gv) =>
        gv.gate.guards.kind === "lesson" &&
        (gv.gate.guards as { lessonId: string }).lessonId === lesson.id,
    );
    const locked =
      !!gateView &&
      gateView.gate.state.kind !== "unlocked" &&
      gateView.gate.state.kind !== "overridden";

    let first: string | null = null;
    let last: string | null = null;

    for (const conceptId of lesson.conceptIds) {
      const nodeId = `concept-${conceptId}`;
      if (!first) first = nodeId;
      last = nodeId;

      const data: ConceptNodeData = {
        name: getName(conceptId),
        conceptId,
        mastery: 0,
        studied: false,
        locked,
      };
      nodes.push({ id: nodeId, type: "concept", position: { x: 0, y: 0 }, data });
      g.setNode(nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    for (let i = 0; i < lesson.conceptIds.length - 1; i++) {
      const srcId = `concept-${lesson.conceptIds[i]}`;
      const tgtId = `concept-${lesson.conceptIds[i + 1]}`;
      edges.push({
        id: `intra-${srcId}-${tgtId}`,
        source: srcId,
        target: tgtId,
        type: "default",
        style: { strokeOpacity: 0.25 },
      });
      g.setEdge(srcId, tgtId);
    }

    lessonAnchors.push({ first: first ?? "", last: last ?? "" });
  }

  for (let li = 0; li < lessons.length - 1; li++) {
    const src = lessonAnchors[li];
    const tgt = lessonAnchors[li + 1];
    if (!src?.last || !tgt?.first) continue;

    const targetLesson = lessons[li + 1];
    if (!targetLesson) continue;
    const gateView = gates.find(
      (gv) =>
        gv.gate.guards.kind === "lesson" &&
        (gv.gate.guards as { lessonId: string }).lessonId === targetLesson.id,
    );

    if (gateView) {
      const dirty = dirtyGateIds.has(gateView.gate.id);
      const data: GateEdgeLabelData = { gate: gateView, dirty };
      edges.push({
        id: `gate-${li}`,
        source: src.last,
        target: tgt.first,
        type: "gateEdge",
        data,
      });
    } else {
      edges.push({
        id: `plain-${li}`,
        source: src.last,
        target: tgt.first,
        type: "default",
        style: { strokeOpacity: 0.3 },
      });
    }
    g.setEdge(src.last, tgt.first);
  }

  dagre.layout(g);
  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) node.position = { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 };
  }

  return { nodes, edges };
}
