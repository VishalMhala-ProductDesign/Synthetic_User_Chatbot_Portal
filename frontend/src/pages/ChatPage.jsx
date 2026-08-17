import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import InsightDrawer from "../components/InsightDrawer";
import ObjectiveOutputDrawer from "../components/ObjectiveOutputDrawer";

const ANALYSIS_FRAMEWORKS = [
  "Empathy Mapping",
  "JTBD Analysis",
  "User Journey Mapping",
  "Task Flow Analysis",
  "Workflow Analysis",
  "Decision Analysis",
  "Pain Point + Friction Analysis",
  "System Mapping",
  "Root Cause Analysis",
  "Opportunity Analysis",
  "AI Opportunity Analysis",
  "Human–AI Workflow Analysis",
  "AI Capability Analysis",
  "Agent / AI Skill Analysis",
  "Future-State Workflow",
  "Human–AI Interaction Design",
  "Trust & Control Analysis",
  "Validation & Usability Analysis",
  "Outcome / KPI Analysis",
];

// Maps a "Grounded in" label (as the model names it, per prompts.py's system
// prompt) back to the actual persona field value, so researchers can verify
// the reply against its stated source instead of just seeing a field name.
function resolveGroundedField(persona, label) {
  if (!persona) return undefined;
  switch (label) {
    case "Name":
      return persona.name;
    case "Age":
      return persona.age;
    case "Industry":
      return persona.industry;
    case "Education":
      return persona.education;
    case "Experience":
      return persona.experience_years != null ? `${persona.experience_years} years` : undefined;
    case "Profession / Role":
      return [persona.profession, persona.role].filter(Boolean).join(" / ");
    default:
      return persona.custom_attributes?.[label];
  }
}

export default function ChatPage() {
  const { personaId } = useParams();
  const { token } = useAuth();

  const [persona, setPersona] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [expandedSources, setExpandedSources] = useState(() => new Set());
  const [selectedFramework, setSelectedFramework] = useState(null);
  const [insight, setInsight] = useState(null);
  const [insightCache, setInsightCache] = useState({});
  const [objectiveFramework, setObjectiveFramework] = useState(null);
  // Empathy Mapping's own saved content for the active session - only fetched
  // while JTBD Analysis is open, since that's the only framework whose
  // Empathy Evidence column links back to it (clicking a "Thinks"/"Feels"/
  // "Says"/"Does" fragment). JTBD generation already requires a fully
  // validated Empathy Mapping insight to exist, so this fetch should always
  // succeed by the time JTBD's drawer is showing.
  const [empathyMappingContent, setEmpathyMappingContent] = useState(null);
  const bottomRef = useRef(null);

  // Mirrors the sidebar's "01-title" numbering so the Insight Panel header
  // names the chat it's currently showing insights for.
  const activeSessionIndex = sessions.findIndex((s) => s.id === activeSessionId);
  const activeSession = activeSessionIndex >= 0 ? sessions[activeSessionIndex] : null;
  const activeSessionNumberedTitle = activeSession
    ? `${String(activeSessionIndex + 1).padStart(2, "0")}-${activeSession.title || "Untitled chat"}`
    : null;

  // Read-only traceability label for the "Objective & Output" drawer's
  // "Input to <framework>" section - shows which chat this analysis is
  // actually built from, not something the researcher edits.
  const sourceLabel = activeSession
    ? `Chat Workspace-${persona?.name || "Persona"} | ${String(activeSessionIndex + 1).padStart(2, "0")} (Chat ID)`
    : null;

  function toggleSources(messageId) {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  const loadSessions = useCallback(async () => {
    const list = await api.listSessions(token, personaId);
    setSessions(list);
    return list;
  }, [token, personaId]);

  async function handleDeleteSession(session, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete chat "${session.title || "Untitled chat"}"? This cannot be undone.`)) return;
    try {
      await api.deleteSession(token, session.id);
      if (session.id === activeSessionId) setActiveSessionId(null);
      await loadSessions();
    } catch (err) {
      setError(err.message);
    }
  }

  async function runInsightGeneration(framework, cacheKey) {
    // Carries forward whatever's already known to be validated for this exact
    // (session, framework) - relevant for "Regenerate", where the researcher's
    // checkmarks must survive since InsightDrawer merges kept rows against the
    // fresh generation itself; a brand-new cacheKey has no entry yet, so this
    // is simply [] for a true first-time generation.
    const priorValidatedRows = insightCache[cacheKey]?.validatedRows || [];
    setInsight({ framework, loading: true, content: null, error: null, validatedRows: priorValidatedRows });
    try {
      const result = await api.generateSessionInsight(token, activeSessionId, framework);
      const entry = { content: result.insight, error: null, validatedRows: priorValidatedRows };
      setInsightCache((prev) => ({ ...prev, [cacheKey]: entry }));
      setInsight({ framework, loading: false, ...entry });
    } catch (err) {
      // Deliberately not cached - a failure like "generate Empathy Mapping
      // first" gets resolved by the researcher's next action, so clicking
      // this framework card again should re-check with the backend instead
      // of replaying a stale cached error forever.
      setInsight({ framework, loading: false, content: null, error: err.message, validatedRows: priorValidatedRows });
    }
  }

  async function handleFrameworkClick(framework) {
    if (!activeSessionId) return;
    setSelectedFramework(framework);
    const cacheKey = `${activeSessionId}:${framework}`;
    const cached = insightCache[cacheKey];
    // Whatever generated the first time stays shown on every subsequent open —
    // only "Regenerate" (below) triggers a fresh generation call.
    if (cached) {
      setInsight({ framework, loading: false, content: cached.content, error: cached.error, validatedRows: cached.validatedRows || [] });
      return;
    }

    // Not cached in this page visit (e.g. the researcher navigated to another
    // chat/persona/feature and came back) — check whether this session/
    // framework already has a saved insight before paying for a fresh LLM
    // generation, so previously generated results (and validated rows) are
    // still there when they come back.
    let saved = null;
    try {
      saved = await api.getSessionInsight(token, activeSessionId, framework);
    } catch {
      // fall through to a fresh generation if the lookup itself fails
    }
    if (saved) {
      const entry = { content: saved.insight, error: null, validatedRows: saved.validated_rows || [] };
      setInsightCache((prev) => ({ ...prev, [cacheKey]: entry }));
      setInsight({ framework, loading: false, ...entry });
      return;
    }
    runInsightGeneration(framework, cacheKey);
  }

  function handleRegenerateInsight() {
    if (!insight || !activeSessionId) return;
    runInsightGeneration(insight.framework, `${activeSessionId}:${insight.framework}`);
  }

  function handleValidatedRowsChange(validatedRows) {
    if (!insight || !activeSessionId) return;
    const cacheKey = `${activeSessionId}:${insight.framework}`;
    setInsightCache((prev) => ({
      ...prev,
      [cacheKey]: { ...(prev[cacheKey] || { content: insight.content, error: insight.error }), validatedRows },
    }));
    api.saveSessionInsightValidatedRows(token, activeSessionId, insight.framework, validatedRows).catch(() => {});
  }

  // Explicit "Save" click from the drawer - persists exactly what's on
  // screen (which may have had unvalidated rows removed) as the record's
  // new content, not just the validated-row keys. Only updates the cache
  // (for the next time this framework is opened) - deliberately doesn't
  // touch the currently-open `insight.content`, since InsightDrawer already
  // has this exact state in its own tableRows and re-feeding the same
  // content back through the `content` prop would just trigger a redundant
  // merge-on-render pass for no benefit.
  async function handleSaveInsight({ content, validatedRows }) {
    if (!insight || !activeSessionId) return;
    const cacheKey = `${activeSessionId}:${insight.framework}`;
    await api.saveSessionInsight(token, activeSessionId, insight.framework, { content, validatedRows });
    setInsightCache((prev) => ({ ...prev, [cacheKey]: { content, error: null, validatedRows } }));
  }

  useEffect(() => {
    setError("");
    Promise.all([api.getPersona(token, personaId), loadSessions()])
      .then(([personaData]) => setPersona(personaData))
      .catch((err) => setError(err.message));
  }, [token, personaId, loadSessions]);

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    api
      .listMessages(token, activeSessionId)
      .then(setMessages)
      .catch((err) => setError(err.message));
  }, [token, activeSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setEmpathyMappingContent(null);
    if (!activeSessionId || insight?.framework !== "JTBD Analysis") return;
    let cancelled = false;
    api
      .getSessionInsight(token, activeSessionId, "Empathy Mapping")
      .then((saved) => {
        if (!cancelled) setEmpathyMappingContent(saved?.insight || null);
      })
      .catch(() => {
        if (!cancelled) setEmpathyMappingContent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, activeSessionId, insight?.framework]);

  async function handleSend(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError("");
    const optimisticMessage = { id: `pending-${Date.now()}`, role: "researcher", text };
    setMessages((prev) => [...prev, optimisticMessage]);
    setDraft("");

    try {
      const result = await api.sendChat(token, personaId, text, activeSessionId);
      setMessages((prev) => [
        ...prev,
        { id: `${result.session_id}-reply-${Date.now()}`, role: "persona", text: result.reply, grounded_in: result.grounded_in },
      ]);
      if (result.session_id !== activeSessionId) {
        setActiveSessionId(result.session_id);
      }
      await loadSessions();
    } catch (err) {
      setError(err.message);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page chat-page">
      {error && <div className="error-banner">{error}</div>}

      <div className="chat-layout">
        <aside className="chat-sessions">
          <div className="chat-sessions-header">
            <h1>
              <span className="chat-panel-header-label">Persona-</span>
              <span className="chat-panel-header-title">{persona?.role || persona?.name || "Persona"}</span>
            </h1>
          </div>
          <div className="chat-sessions-body">
            <button type="button" onClick={() => setActiveSessionId(null)}>
              + New chat
            </button>
            <ul>
              {sessions.map((s, i) => (
                <li key={s.id} className="chat-session-row">
                  <button
                    type="button"
                    className={s.id === activeSessionId ? "session-active" : ""}
                    onClick={() => setActiveSessionId(s.id)}
                  >
                    {String(i + 1).padStart(2, "0")}-{s.title || "Untitled chat"}
                  </button>
                  <button
                    type="button"
                    className="chat-session-delete"
                    aria-label="Delete chat"
                    onClick={(e) => handleDeleteSession(s, e)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="chat-main">
          <p className="chat-panel-header">
            <span className="chat-panel-header-label">Chat Workspace-</span>
            <span className="chat-panel-header-title">{persona?.name}</span>
          </p>
          <div className="chat-messages">
            {messages.length === 0 && <p className="empty-state">Start the conversation below.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`chat-bubble chat-bubble-${m.role}`}>
                <p className="chat-bubble-speaker">{m.role === "researcher" ? "You" : persona?.name}</p>
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                </div>
                {m.grounded_in?.length > 0 && (
                  <div className="grounded-block">
                    <button type="button" className="link-button" onClick={() => toggleSources(m.id)}>
                      {expandedSources.has(m.id) ? "Hide sources" : "Show sources"} ({m.grounded_in.length})
                    </button>
                    {expandedSources.has(m.id) && (
                      <dl className="field-list grounded-sources">
                        {m.grounded_in.map((label) => {
                          const value = resolveGroundedField(persona, label);
                          const isEmpty = value === undefined || value === null || value === "";
                          return (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{isEmpty ? "(not found on persona)" : String(value)}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form className="chat-input-row" onSubmit={handleSend}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${persona?.name || "persona"}…`}
              disabled={sending}
            />
            <button type="submit" disabled={sending || !draft.trim()}>
              {sending ? "Sending…" : "Send"}
            </button>
          </form>
        </section>

        <aside className="chat-analysis">
          <p className="chat-panel-header">
            {activeSessionNumberedTitle ? (
              <>
                <span className="chat-panel-header-label">Insight of -</span>
                <span className="chat-panel-header-title">{activeSessionNumberedTitle}</span>
              </>
            ) : (
              <>
                <span className="chat-panel-header-label">Insight-</span>
                <span className="chat-panel-header-title">Select Chat</span>
              </>
            )}
          </p>
          <div className="chat-analysis-body">
            {ANALYSIS_FRAMEWORKS.map((framework) => (
              <div key={framework} className="framework-row">
                <button
                  type="button"
                  className={`framework-card${selectedFramework === framework ? " framework-card-active" : ""}`}
                  onClick={() => handleFrameworkClick(framework)}
                  disabled={!activeSession}
                >
                  {framework}
                </button>
                <button
                  type="button"
                  className="objective-output-button"
                  onClick={() => setObjectiveFramework(framework)}
                >
                  Objective &amp; Output
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {insight && (
        <InsightDrawer
          framework={insight.framework}
          loading={insight.loading}
          content={insight.content}
          error={insight.error}
          onClose={() => setInsight(null)}
          onRegenerate={handleRegenerateInsight}
          initialValidatedRows={insight.validatedRows}
          onValidatedRowsChange={handleValidatedRowsChange}
          onSave={handleSaveInsight}
          workspaceLabel={sourceLabel}
          personaLabel={persona?.name}
          sourceTableContent={empathyMappingContent}
          messages={messages.map((m) => ({
            id: m.id,
            role: m.role,
            speaker: m.role === "researcher" ? "You" : persona?.name || "Persona",
            text: m.text,
          }))}
        />
      )}

      {objectiveFramework && (
        <ObjectiveOutputDrawer
          framework={objectiveFramework}
          sourceLabel={sourceLabel}
          onClose={() => setObjectiveFramework(null)}
        />
      )}
    </div>
  );
}
