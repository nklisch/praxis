import type { EngineConfigSnapshot } from "@praxis/core/types";
import { type FormEvent, useEffect, useState } from "react";
import { RouteHeader } from "../components/route-header.js";
import { getRouteMeta } from "../components/route-meta.js";
import { usePraxisClient } from "../context/client-context.js";
import { COPY } from "../lib/copy.js";
import styles from "./settings.module.css";

const ENGINE_OPTIONS = [
  { id: "direct.anthropic", label: "Direct — Anthropic (Claude)" },
  { id: "direct.openai", label: "Direct — OpenAI (GPT)" },
  { id: "direct.google", label: "Direct — Google (Gemini)" },
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
];

export function SettingsRoute() {
  const client = usePraxisClient();
  const [config, setConfig] = useState<EngineConfigSnapshot | null>(null);
  // Local in-flight edits to the API key. `null` means "no edit in
  // progress — preserve whatever is stored". A string (empty or non-empty)
  // means the user has opened the edit affordance and is typing.
  const [apiKeyEdit, setApiKeyEdit] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"ok" | "error" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const meta = getRouteMeta("settings");

  useEffect(() => {
    client.config
      .engineConfig()
      .then(setConfig)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : String(err));
      });
  }, [client]);

  const handleEditApiKey = async () => {
    // Pull the decrypted value into the edit input on demand.
    try {
      const { apiKey } = await client.config.revealApiKey();
      setApiKeyEdit(apiKey ?? "");
    } catch {
      setApiKeyEdit("");
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setSaveResult(null);
    try {
      await client.config.setEngineConfig({
        ...config,
        // Pass through the in-flight edit (string | undefined).
        // `undefined` preserves the stored key; `""` clears it.
        ...(apiKeyEdit !== null && { apiKey: apiKeyEdit }),
      });
      setSaveResult("ok");
      setApiKeyEdit(null);
      // Refetch the snapshot so hasApiKey reflects the new value.
      const next = await client.config.engineConfig();
      setConfig(next);
    } catch {
      setSaveResult("error");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className={styles.container}>
        <p className={styles.error}>{COPY.error.generic("load settings")}</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className={styles.container}>
        <p className={styles.loading}>{COPY.loading.default}</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <RouteHeader
        ornament={meta.ornament}
        kicker={meta.kicker}
        title={meta.title}
        deck={meta.deck}
        actions={
          <button
            type="submit"
            form="settings-form"
            className={styles.saveButton}
            disabled={saving}
          >
            {saving ? COPY.loading.saving : "Save"}
          </button>
        }
      />
      <form id="settings-form" className={styles.form} onSubmit={handleSave}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Engine</h2>
          <label className={styles.field}>
            <span className={styles.label}>Engine</span>
            <select
              className={styles.select}
              value={config.engineId}
              onChange={(e) => setConfig({ ...config, engineId: e.target.value })}
            >
              {ENGINE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Model (optional)</span>
            <input
              type="text"
              className={styles.input}
              value={config.model ?? ""}
              placeholder="e.g. claude-3-5-sonnet-latest"
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  setConfig({ ...config, model: val });
                } else {
                  const { model: _m, ...rest } = config;
                  setConfig(rest);
                }
              }}
            />
          </label>

          <div className={styles.field}>
            <span className={styles.label}>API Key (optional)</span>
            {apiKeyEdit === null ? (
              <div className={styles.apiKeyDisplay}>
                <span className={styles.apiKeyStatus}>
                  {config.hasApiKey ? "API key configured" : "Not configured"}
                </span>
                <button
                  type="button"
                  className={styles.apiKeyEditButton}
                  onClick={handleEditApiKey}
                >
                  {config.hasApiKey ? "Edit" : "Add"}
                </button>
              </div>
            ) : (
              <input
                type="password"
                className={styles.input}
                value={apiKeyEdit}
                placeholder="sk-…"
                onChange={(e) => setApiKeyEdit(e.target.value)}
                // biome-ignore lint/a11y/noAutofocus: focusing on edit affordance
                autoFocus
              />
            )}
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Base URL (optional)</span>
            <input
              type="text"
              className={styles.input}
              value={config.baseUrl ?? ""}
              placeholder="https://api.anthropic.com"
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  setConfig({ ...config, baseUrl: val });
                } else {
                  const { baseUrl: _u, ...rest } = config;
                  setConfig(rest);
                }
              }}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Effort</span>
            <select
              className={styles.select}
              value={config.effort ?? ""}
              onChange={(e) => {
                const val = e.target.value as EngineConfigSnapshot["effort"];
                if (val) {
                  setConfig({ ...config, effort: val });
                } else {
                  const { effort: _eff, ...rest } = config;
                  setConfig(rest);
                }
              }}
            >
              <option value="">Default</option>
              <option value="minimal">Minimal</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">X-High</option>
            </select>
          </label>
        </section>

        <div className={styles.actions}>
          {saveResult === "ok" && <span className={styles.successMsg}>Saved!</span>}
          {saveResult === "error" && (
            <span className={styles.errorMsg}>{COPY.error.generic("save settings")}</span>
          )}
        </div>
      </form>
    </div>
  );
}
