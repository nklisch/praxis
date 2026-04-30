import type { CourseId, Gate, GateId, GateView, Lesson, SessionId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { Background, Controls, type Node, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConceptFlowNode, ConceptNodeData } from "../../components/concept-node.js";
import { ConceptNode } from "../../components/concept-node.js";
import { ConfigureChatPane } from "../../components/configure-chat-pane.js";
import type { GateEdgeLabelData } from "../../components/gate-edge-label.js";
import { GateEdgeLabel } from "../../components/gate-edge-label.js";
import { GateInspector } from "../../components/gate-inspector.js";
import { usePraxisClient } from "../../context/client-context.js";
import { useConfigureState } from "../../hooks/use-configure-state.js";
import { useCourses } from "../../hooks/use-courses.js";
import styles from "./gates-tab.module.css";

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
 * Gates tab — React Flow canvas extending Phase 9's read-only map with edit affordances.
 *
 * Click a gate edge label (or concept node adjacent to a gate) → opens GateInspector.
 * Inspector: edit mastery threshold, override, delete.
 */
export function GatesTab({ sessionId }: GatesTabProps) {
  const client = usePraxisClient();
  const { selectedCourseId, setSelectedCourseId } = useConfigureState();
  const { courses, loading: coursesLoading } = useCourses();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [gateViews, setGateViews] = useState<GateView[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGate, setSelectedGate] = useState<Gate | null>(null);

  const loadData = useCallback(async () => {
    if (!selectedCourseId) return;
    setLoading(true);
    setError(null);
    try {
      const [lessonsData, gateViewsData, gatesData] = await Promise.all([
        client.artifacts.lessons(selectedCourseId),
        client.artifacts.gateView(selectedCourseId),
        client.artifacts.gates(selectedCourseId),
      ]);
      setLessons(lessonsData);
      setGateViews(gateViewsData);
      setGates(gatesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, selectedCourseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { nodes, edges } = useMemo(() => {
    if (lessons.length === 0) return { nodes: [], edges: [] };
    return buildGraph(lessons, gateViews);
  }, [lessons, gateViews]);

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
    setGates((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setSelectedGate(updated);
    // Refresh gate views for the progress display
    loadData();
  };

  const handleGateDeleted = (gateId: GateId) => {
    setGates((prev) => prev.filter((g) => g.id !== gateId));
    setSelectedGate(null);
    loadData();
  };

  return (
    <div className={styles.layout}>
      <div className={styles.chatPane}>
        <ConfigureChatPane sessionId={sessionId} />
      </div>

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
                  onPaneClick={() => setSelectedGate(null)}
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

            {selectedGate && (
              <GateInspector
                gate={selectedGate}
                onSaved={handleGateSaved}
                onDeleted={handleGateDeleted}
                onClose={() => setSelectedGate(null)}
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
        name: conceptId,
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
      const data: GateEdgeLabelData = { gate: gateView };
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
