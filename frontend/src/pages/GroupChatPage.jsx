import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import InsightDrawer from "../components/InsightDrawer";
import ObjectiveOutputDrawer from "../components/ObjectiveOutputDrawer";
import { FRAMEWORK_PHASES, frameworkStatusLabel, frameworkStatusClass, isInsightFramework } from "../lib/frameworks";

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

export default function GroupChatPage() {
  const { groupId } = useParams();
  const { token } = useAuth();

  const [group, setGroup] = useState(null);
  const [personas, setPersonas] = useState([]);
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
  // Which framework cards are clickable for the active session - Empathy Mapping
  // is always unlocked, every later one only once every earlier stage has been
  // generated and researcher-verified (see get_group_session_insight_status in
  // main.py, the same check generating one would actually enforce). Keyed by
  // framework name; a missing entry is treated as locked.
  const [frameworkStatus, setFrameworkStatus] = useState({});
  // Guards refreshFrameworkStatus against a stale response landing after the
  // researcher has already switched to a different chat.
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const bottomRef = useRef(null);

  const personasById = Object.fromEntries(personas.map((p) => [p.id, p]));

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
    ? `Chat Workspace-${personas.map((p) => p.name).join(", ")} | ${String(activeSessionIndex + 1).padStart(2, "0")} (Chat ID)`
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
    const list = await api.listGroupSessions(token, groupId);
    setSessions(list);
    return list;
  }, [token, groupId]);

  const refreshFrameworkStatus = useCallback(
    (sessionId) => {
      if (!sessionId) return;
      api
        .getGroupSessionInsightStatus(token, sessionId)
        .then((status) => {
          if (sessionId === activeSessionIdRef.current) setFrameworkStatus(status);
        })
        .catch(() => {});
    },
    [token]
  );

  async function handleDeleteSession(session, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete chat "${session.title || "Untitled chat"}"? This cannot be undone.`)) return;
    try {
      await api.deleteGroupSession(token, session.id);
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
      const result = await api.generateGroupSessionInsight(token, activeSessionId, framework);
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
      saved = await api.getGroupSessionInsight(token, activeSessionId, framework);
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
    api.saveGroupSessionInsightValidatedRows(token, activeSessionId, insight.framework, validatedRows).catch(() => {});
    // A checkbox toggle here is exactly what can unlock the next framework's
    // card (or re-lock it, if the researcher unchecked something) - refresh
    // right away rather than waiting for the researcher to switch chats.
    refreshFrameworkStatus(activeSessionId);
  }

  async function handleSaveInsight({ content, validatedRows }) {
    if (!insight || !activeSessionId) return;
    const cacheKey = `${activeSessionId}:${insight.framework}`;
    await api.saveGroupSessionInsight(token, activeSessionId, insight.framework, { content, validatedRows });
    setInsightCache((prev) => ({ ...prev, [cacheKey]: { content, error: null, validatedRows } }));
    refreshFrameworkStatus(activeSessionId);
  }

  useEffect(() => {
    setError("");
    Promise.all([api.listGroups(token), api.listPersonas(token, groupId), loadSessions()])
      .then(([groups, groupPersonas]) => {
        setGroup(groups.find((g) => g.id === groupId) ?? null);
        setPersonas(groupPersonas);
      })
      .catch((err) => setError(err.message));
  }, [token, groupId, loadSessions]);

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    api
      .listGroupMessages(token, activeSessionId)
      .then(setMessages)
      .catch((err) => setError(err.message));
  }, [token, activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) {
      setFrameworkStatus({});
      return;
    }
    // Empathy Mapping is always unlocked - seed it immediately rather than
    // waiting on the round trip, so its card doesn't flash disabled for a beat.
    setFrameworkStatus({ "Empathy Mapping": { unlocked: true, reason: null } });
    refreshFrameworkStatus(activeSessionId);
  }, [activeSessionId, refreshFrameworkStatus]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setEmpathyMappingContent(null);
    if (!activeSessionId || insight?.framework !== "JTBD Analysis") return;
    let cancelled = false;
    api
      .getGroupSessionInsight(token, activeSessionId, "Empathy Mapping")
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
      const result = await api.sendGroupChat(token, groupId, text, activeSessionId);
      setMessages((prev) => [
        ...prev,
        ...result.replies.map((r, i) => ({
          id: `${result.session_id}-reply-${Date.now()}-${i}`,
          role: "persona",
          persona_id: r.persona_id,
          persona_name: r.persona_name,
          text: r.reply,
          grounded_in: r.grounded_in,
        })),
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

      {personas.length === 0 ? (
        <>
          <div className="page-header">
            <div>
              <h1>
                <span className="chat-panel-header-label">Persona Group</span>
                <span className="chat-panel-header-title">{group?.name || "Persona Group"}</span>
              </h1>
            </div>
          </div>
          <p className="empty-state">This group has no personas yet — add some before starting a chat.</p>
        </>
      ) : (
        <div className="chat-layout">
          <aside className="chat-sessions">
            <div className="chat-sessions-header">
              <h1>
                <span className="chat-panel-header-label">Persona Group</span>
                <span className="chat-panel-header-title">{group?.name || "Persona Group"}</span>
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
              <span className="chat-panel-header-title">{personas.map((p) => p.name).join(", ")}</span>
            </p>
            <div className="chat-messages">
              {messages.length === 0 && <p className="empty-state">Start the conversation below.</p>}
              {messages.map((m) => (
                <div key={m.id} className={`chat-bubble chat-bubble-${m.role}`}>
                  <p className="chat-bubble-speaker">{m.role === "researcher" ? "You" : m.persona_name}</p>
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
                            const value = resolveGroundedField(personasById[m.persona_id], label);
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
                placeholder={`Ask the ${group?.name || "group"}…`}
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
              {FRAMEWORK_PHASES.map(({ phase, frameworks }) => (
                <div key={phase} className="framework-phase-group">
                  <p className="framework-phase-header">{phase}</p>
                  {frameworks.map((framework) => (
                    <div key={framework} className="framework-item">
                      <div className="framework-row">
                        <button
                          type="button"
                          className={`framework-card${selectedFramework === framework ? " framework-card-active" : ""}${isInsightFramework(framework) ? " framework-card-insight" : ""}`}
                          onClick={() => handleFrameworkClick(framework)}
                          disabled={!activeSession || !frameworkStatus[framework]?.unlocked}
                          title={frameworkStatus[framework]?.reason || undefined}
                        >
                          <span className="framework-card-label">{framework}</span>
                          <span className={`framework-legend-badge ${frameworkStatusClass(frameworkStatus[framework])}`}>
                            <span className="framework-legend-dot" />
                            {frameworkStatusLabel(frameworkStatus[framework])}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="objective-output-button"
                          onClick={() => setObjectiveFramework(framework)}
                          title="Objective & Output"
                        >
                          O&amp;O
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      {insight && (
        <InsightDrawer
          framework={insight.framework}
          loading={insight.loading}
          content={insight.content}
          error={insight.error}
          onClose={() => {
            setInsight(null);
            setSelectedFramework(null);
          }}
          onRegenerate={handleRegenerateInsight}
          initialValidatedRows={insight.validatedRows}
          onValidatedRowsChange={handleValidatedRowsChange}
          onSave={handleSaveInsight}
          workspaceLabel={sourceLabel}
          personaLabel={personas.map((p) => p.name).join(", ")}
          sourceTableContent={empathyMappingContent}
          messages={messages.map((m) => ({
            id: m.id,
            role: m.role,
            speaker: m.role === "researcher" ? "You" : m.persona_name || "Persona",
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
