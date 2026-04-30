import type { CourseId, GateView, Lesson } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { Background, Controls, type Edge, type Node, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useNavigate, useParams } from "@tanstack/react-router";
import dagre from "dagre";
import { useCallback, useMemo, useState } from "react";
import type { ConceptFlowNode, ConceptNodeData } from "../components/concept-node.js";
import { ConceptNode } from "../components/concept-node.js";
import type { ConceptInfo } from "../components/concept-side-panel.js";
import { ConceptSidePanel } from "../components/concept-side-panel.js";
import type { GateEdgeLabelData } from "../components/gate-edge-label.js";
import { GateEdgeLabel } from "../components/gate-edge-label.js";
import { useCourseDetail } from "../hooks/use-course-detail.js";
import type { ConceptRow } from "../hooks/use-course-gates.js";
import { useCourseGates } from "../hooks/use-course-gates.js";
import styles from "./course-map.module.css";

const NODE_WIDTH = 160;
const NODE_HEIGHT = 70;

interface BuildGraphArgs {
  lessons: Lesson[];
  /** Phase 10: per-concept BKT-aware mastery (effectivePKnown, 0..1). */
  masteryByConceptId: Map<string, number>;
  gates: GateView[];
  /** Phase 10: concept name lookup by prefixed concept id. */
  conceptsById: Map<string, ConceptRow>;
}

/**
 * Build React Flow nodes and edges from lesson / gate data using dagre auto-layout.
 *
 * Layout strategy:
 *  - Each lesson is a column (left-to-right by lesson order).
 *  - Concepts within a lesson are stacked vertically.
 *  - Gate edges connect the last concept-group of lesson N to the first of lesson N+1.
 *  - dagre handles spacing automatically; falls back gracefully for small courses.
 *
 * Phase 10: node names come from the concept graph (real names from the pack or extractor);
 * mastery comes from per-concept BKT-aware effectivePKnown via student model.
 */
function buildGraph({ lessons, masteryByConceptId, gates, conceptsById }: BuildGraphArgs): {
  nodes: ConceptFlowNode[];
  edges: Edge[];
} {
  if (lessons.length === 0) return { nodes: [], edges: [] };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80, marginx: 20, marginy: 20 });

  const nodes: ConceptFlowNode[] = [];
  const edges: Edge[] = [];

  // Track the "anchor" node id for each lesson (last concept in the lesson).
  // Used to draw gate edges between lessons.
  const lessonAnchorNodes: Array<{ first: string; last: string }> = [];

  for (const lesson of lessons) {
    const lessonGate = gates.find(
      (gv) =>
        gv.gate.guards.kind === "lesson" &&
        (gv.gate.guards as { lessonId: string }).lessonId === lesson.id,
    );
    const lessonLocked =
      !!lessonGate &&
      lessonGate.gate.state.kind !== "unlocked" &&
      lessonGate.gate.state.kind !== "overridden";

    let firstNodeId: string | null = null;
    let lastNodeId: string | null = null;

    for (const conceptId of lesson.conceptIds) {
      const nodeId = `concept-${conceptId}`;
      if (!firstNodeId) firstNodeId = nodeId;
      lastNodeId = nodeId;

      // Phase 10: use real mastery from student model, fall back to 0.
      const mastery = masteryByConceptId.get(conceptId) ?? 0;
      // Phase 10: use real concept name from the concept graph, fall back to id.
      const conceptRow = conceptsById.get(conceptId);
      const displayName = conceptRow?.name ?? conceptId;

      const data: ConceptNodeData = {
        name: displayName,
        mastery,
        studied: mastery > 0,
        locked: lessonLocked,
      };

      const node: ConceptFlowNode = {
        id: nodeId,
        type: "concept",
        position: { x: 0, y: 0 }, // dagre will override
        data,
      };
      nodes.push(node);

      g.setNode(nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    // Vertical edges within a lesson (chain concepts top-to-bottom)
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

    if (firstNodeId && lastNodeId) {
      lessonAnchorNodes.push({ first: firstNodeId, last: lastNodeId });
    } else {
      // Lesson with no concepts — push a placeholder so gate index lines up.
      lessonAnchorNodes.push({ first: "", last: "" });
    }
  }

  // Gate edges between consecutive lessons
  for (let li = 0; li < lessons.length - 1; li++) {
    const srcAnchor = lessonAnchorNodes[li];
    const tgtAnchor = lessonAnchorNodes[li + 1];
    if (!srcAnchor?.last || !tgtAnchor?.first) continue;

    // Find the gate guarding the target lesson
    const targetLesson = lessons[li + 1];
    if (!targetLesson) continue;
    const gateView = gates.find(
      (gv) =>
        gv.gate.guards.kind === "lesson" &&
        (gv.gate.guards as { lessonId: string }).lessonId === targetLesson.id,
    );

    if (gateView) {
      const edgeId = `gate-${li}-${li + 1}`;
      const edgeData: GateEdgeLabelData = { gate: gateView };
      edges.push({
        id: edgeId,
        source: srcAnchor.last,
        target: tgtAnchor.first,
        type: "gateEdge",
        data: edgeData,
      });
      g.setEdge(srcAnchor.last, tgtAnchor.first);
    } else {
      // No gate — plain connector
      edges.push({
        id: `plain-${li}-${li + 1}`,
        source: srcAnchor.last,
        target: tgtAnchor.first,
        type: "default",
        style: { strokeOpacity: 0.3 },
      });
      g.setEdge(srcAnchor.last, tgtAnchor.first);
    }
  }

  // Run dagre layout
  dagre.layout(g);

  // Apply computed positions to nodes
  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      node.position = {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      };
    }
  }

  return { nodes, edges };
}

/** Build the ConceptInfo map used by the side panel. */
function buildConceptInfoMap(
  lessons: Lesson[],
  masteryByConceptId: Map<string, number>,
  gates: GateView[],
  conceptsById: Map<string, ConceptRow>,
): Map<string, ConceptInfo> {
  const infoMap = new Map<string, ConceptInfo>();

  for (const lesson of lessons) {
    const lessonGate = gates.find(
      (gv) =>
        gv.gate.guards.kind === "lesson" &&
        (gv.gate.guards as { lessonId: string }).lessonId === lesson.id,
    );
    const lessonLocked =
      !!lessonGate &&
      lessonGate.gate.state.kind !== "unlocked" &&
      lessonGate.gate.state.kind !== "overridden";

    for (const conceptId of lesson.conceptIds) {
      const existing = infoMap.get(conceptId);
      const mastery = masteryByConceptId.get(conceptId) ?? 0;
      // Phase 10: real name from concept graph; fall back to id.
      const conceptRow = conceptsById.get(conceptId);
      const name = conceptRow?.name ?? conceptId;

      infoMap.set(conceptId, {
        id: brandId<"ConceptId">(conceptId),
        name,
        mastery,
        studied: mastery > 0,
        locked: lessonLocked,
        lessons: existing ? [...existing.lessons, lesson] : [lesson],
      });
    }
  }

  return infoMap;
}

// React Flow nodeTypes / edgeTypes — typed as Record<string, any> since the
// library's NodeTypes/EdgeTypes use `data: any` internally for extensibility.
// biome-ignore lint/suspicious/noExplicitAny: React Flow node/edge registries use ComponentType<any>
const NODE_TYPES: Record<string, React.ComponentType<any>> = {
  concept: ConceptNode,
};

// biome-ignore lint/suspicious/noExplicitAny: React Flow edge registries use ComponentType<any>
const EDGE_TYPES: Record<string, React.ComponentType<any>> = {
  gateEdge: GateEdgeLabel,
};

/**
 * Progress Map route at /courses/$courseId/map.
 *
 * Renders a React Flow canvas with:
 *  - Concept nodes colored by mastery / lock state.
 *  - Gate edges between lesson groups showing summaryText + progress bar.
 *  - Click on a node → ConceptSidePanel for details.
 *  - "← Course" back button in the header.
 *
 * Phase 10: nodes show real concept names (from the concept graph) and
 * per-concept BKT-aware mastery (from the student model), replacing the
 * Phase 9 UUID + gate-progress placeholders.
 */
export function CourseMapRoute() {
  const { courseId: rawCourseId } = useParams({ strict: false });
  const courseId = rawCourseId ? brandId<"CourseId">(rawCourseId) : undefined;

  const navigate = useNavigate();
  const {
    course,
    lessons,
    loading: courseLoading,
    error: courseError,
  } = useCourseDetail(courseId as CourseId | undefined);
  const {
    gates,
    conceptsById,
    masteryByConceptId,
    loading: gatesLoading,
    error: gatesError,
  } = useCourseGates(courseId as CourseId | undefined);

  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);

  const loading = courseLoading || gatesLoading;
  const error = courseError ?? gatesError;

  const conceptInfoMap = useMemo(
    () => buildConceptInfoMap(lessons, masteryByConceptId, gates, conceptsById),
    [lessons, masteryByConceptId, gates, conceptsById],
  );

  const { nodes, edges } = useMemo(
    () => buildGraph({ lessons, masteryByConceptId, gates, conceptsById }),
    [lessons, masteryByConceptId, gates, conceptsById],
  );

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const conceptId = node.id.replace("concept-", "");
    setSelectedConceptId(conceptId);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedConceptId(null);
  }, []);

  const selectedConcept = selectedConceptId ? conceptInfoMap.get(selectedConceptId) : null;

  if (loading) {
    return (
      <div className={styles.layout}>
        <p className={styles.status}>Loading progress map…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.layout}>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className={styles.layout}>
        <p className={styles.status}>Course not found.</p>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate({ to: "/courses/$courseId", params: { courseId: course.id } })}
        >
          ← Course
        </button>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>{course.title} — Progress Map</h1>
          <p className={styles.meta}>
            {course.subject} · {course.gradeLevel} · {lessons.length} lesson
            {lessons.length !== 1 ? "s" : ""} · {gates.length} gate
            {gates.length !== 1 ? "s" : ""}
          </p>
        </div>
      </header>

      <div className={styles.canvasContainer}>
        {nodes.length === 0 ? (
          <div className={styles.empty}>
            <p>No concepts yet. Run a bootstrap session to populate the course.</p>
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
            className={styles.flow}
          >
            <Background />
            <Controls />
          </ReactFlow>
        )}

        {selectedConcept && (
          <ConceptSidePanel
            concept={selectedConcept}
            gates={gates}
            onClose={() => setSelectedConceptId(null)}
          />
        )}
      </div>
    </div>
  );
}
