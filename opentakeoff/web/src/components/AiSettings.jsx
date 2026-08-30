// AI settings — platform Cerebras by default; optional advanced override.
import { useState } from "react";
import { Icon } from "../brand/icons.jsx";
import {
  aiConfig, saveAiConfig, clearAiConfigToPlatform, isPlatformAi, PLATFORM_AI,
} from "../lib/ai.js";

export default function AiSettings({ onClose }) {
  const [cfg, setCfg] = useState(aiConfig);
  const [advanced, setAdvanced] = useState(!isPlatformAi());
  const set = (k) => (e) => setCfg((c) => ({ ...c, [k]: e.target.value }));
  const save = () => { saveAiConfig(cfg); onClose(true); };
  const usePlatform = () => {
    clearAiConfigToPlatform();
    setCfg(aiConfig());
    setAdvanced(false);
    onClose(true);
  };

  return (
    <div onClick={() => onClose(false)} style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(14,26,46,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: 520, maxWidth: "100%", maxHeight: "90%", overflow: "auto", background: "var(--paper-bright)", boxShadow: "var(--shadow-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--ink)" }}>
          <Icon name="target" size={16} />
          <strong style={{ fontFamily: "var(--f-display)", fontSize: 15 }}>AI</strong>
        </div>
        <div style={{ padding: 16, fontSize: 13, lineHeight: 1.6, color: "var(--ink)" }}>
          <p style={{ marginTop: 0, background: "var(--paper-shadow)", padding: "10px 12px" }}>
            <strong>Platform default (no setup):</strong> Agent uses Cerebras
            {" "}<code>{PLATFORM_AI.model}</code> with vision{" "}
            <code>{PLATFORM_AI.visionModel}</code>. The API key stays on the
            dev server (<code>CEREBRAS_API_KEY</code> in{" "}
            <code>opentakeoff/server/.env</code> or <code>web/.env</code>) —
            not in this browser.
          </p>
          {!advanced ? (
            <p style={{ margin: "12px 0 0", color: "var(--ink-muted)" }}>
              You do not need to fill anything in. Close this and run Agent.
              {" "}
              <button type="button" className="btn-ghost" onClick={() => setAdvanced(true)}
                style={{ padding: "2px 6px", fontSize: 12 }}>
                Advanced override…
              </button>
            </p>
          ) : (
            <>
              <p style={{ margin: "8px 0", color: "var(--ink-muted)", fontSize: 12.5 }}>
                Advanced — only if you are pointing at a different runtime.
              </p>
              <label style={{ display: "block", margin: "6px 0" }}>
                <span className="field-label">Endpoint</span>
                <input value={cfg.endpoint} onChange={set("endpoint")} placeholder={PLATFORM_AI.endpoint}
                  className="field-input" style={{ marginTop: 4 }} />
              </label>
              <label style={{ display: "block", margin: "6px 0" }}>
                <span className="field-label">API style</span>
                <select value={cfg.provider} onChange={set("provider")} className="field-input" style={{ marginTop: 4 }}>
                  <option value="openai">OpenAI-style API</option>
                  <option value="anthropic">Anthropic-style API</option>
                </select>
              </label>
              <label style={{ display: "block", margin: "6px 0" }}>
                <span className="field-label">Model</span>
                <input value={cfg.model} onChange={set("model")} placeholder={PLATFORM_AI.model}
                  className="field-input" style={{ marginTop: 4 }} />
              </label>
              <label style={{ display: "block", margin: "6px 0" }}>
                <span className="field-label">Vision model</span>
                <input value={cfg.visionModel === cfg.model ? "" : cfg.visionModel} onChange={set("visionModel")}
                  placeholder={PLATFORM_AI.visionModel}
                  className="field-input" style={{ marginTop: 4 }} />
              </label>
              <label style={{ display: "block", margin: "6px 0" }}>
                <span className="field-label">API key (leave blank for platform proxy)</span>
                <input type="password" value={cfg.apiKey} onChange={set("apiKey")} placeholder="not needed for /cerebras-api"
                  className="field-input" style={{ marginTop: 4 }} />
              </label>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", padding: "12px 16px", borderBottom: "none", borderTop: "1px solid var(--ink-faint)" }}>
          <button className="btn-ghost" onClick={usePlatform}>Use platform defaults</button>
          <span style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" onClick={() => onClose(false)}>Close</button>
            {advanced && <button className="btn-primary" onClick={save}>Save override</button>}
          </span>
        </div>
      </div>
    </div>
  );
}
