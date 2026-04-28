import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const conceptGraphs = sqliteTable("concept_graphs", {
  id: text("id").primaryKey(),
  source: text("source", { enum: ["canonical", "extracted", "hybrid"] }).notNull(),
  standardsBody: text("standards_body"),
  standardsVersion: text("standards_version"),
  name: text("name").notNull(),
  version: text("version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const concepts = sqliteTable(
  "concepts",
  {
    id: text("id").primaryKey(),
    graphId: text("graph_id")
      .notNull()
      .references(() => conceptGraphs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    aliasesJson: text("aliases_json", { mode: "json" }).notNull(),
    standardsTagsJson: text("standards_tags_json", { mode: "json" }).notNull(),
    // embedding column intentionally omitted — Phase 5 adds sqlite-vec virtual table.
  },
  (t) => ({
    graphNameIdx: index("concepts_graph_name_idx").on(t.graphId, t.name),
  }),
);

export const prerequisiteEdges = sqliteTable(
  "prerequisite_edges",
  {
    fromId: text("from_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    toId: text("to_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    strengthMilli: integer("strength_milli").notNull(), // 0..1000
    source: text("source", { enum: ["canonical", "extracted", "manual"] }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.fromId, t.toId] }),
    fromIdx: index("edges_from_idx").on(t.fromId),
    toIdx: index("edges_to_idx").on(t.toId),
  }),
);

export const curriculumSchema = {
  conceptGraphs,
  concepts,
  prerequisiteEdges,
};
