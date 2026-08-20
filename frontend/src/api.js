// Empty by default so every call below (e.g. `${API_BASE}/api/...`) resolves to a
// same-origin relative URL, handled by vite.config.js's dev-server proxy — this
// avoids CORS/mixed-content issues regardless of what host/protocol the page was
// loaded from. Set VITE_API_URL only if the backend isn't reachable via that proxy
// (e.g. a non-Vite production build).
const API_BASE = import.meta.env.VITE_API_URL || "";

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res) {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      // response had no JSON body
    }
    throw new Error(detail);
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return res.text();
}

function jsonBody(token, body) {
  return {
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(body),
  };
}

async function downloadFile(url, token, fallbackName) {
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Export failed");
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackName;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export const api = {
  signup: (email, password, display_name) =>
    fetch(`${API_BASE}/api/auth/signup?${new URLSearchParams({ email, password, display_name })}`, {
      method: "POST",
    }).then(handle),

  login: (email, password) =>
    fetch(`${API_BASE}/api/auth/login?${new URLSearchParams({ email, password })}`, {
      method: "POST",
    }).then(handle),

  me: (token) => fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders(token) }).then(handle),

  listPersonas: (token, groupId) => {
    const qs = groupId ? `?${new URLSearchParams({ group_id: groupId })}` : "";
    return fetch(`${API_BASE}/api/personas${qs}`, { headers: authHeaders(token) }).then(handle);
  },
  getPersona: (token, id) =>
    fetch(`${API_BASE}/api/personas/${id}`, { headers: authHeaders(token) }).then(handle),
  generatePersona: (token, description) =>
    fetch(`${API_BASE}/api/personas/generate?${new URLSearchParams({ description })}`, {
      method: "POST",
      headers: authHeaders(token),
    }).then(handle),
  createPersona: (token, payload) =>
    fetch(`${API_BASE}/api/personas`, { method: "POST", ...jsonBody(token, payload) }).then(handle),
  updatePersona: (token, id, payload) =>
    fetch(`${API_BASE}/api/personas/${id}`, { method: "PUT", ...jsonBody(token, payload) }).then(handle),
  deletePersona: (token, id) =>
    fetch(`${API_BASE}/api/personas/${id}`, { method: "DELETE", headers: authHeaders(token) }).then(handle),

  listGroups: (token) => fetch(`${API_BASE}/api/groups`, { headers: authHeaders(token) }).then(handle),
  createGroup: (token, payload) =>
    fetch(`${API_BASE}/api/groups`, { method: "POST", ...jsonBody(token, payload) }).then(handle),
  updateGroup: (token, id, payload) =>
    fetch(`${API_BASE}/api/groups/${id}`, { method: "PUT", ...jsonBody(token, payload) }).then(handle),
  deleteGroup: (token, id) =>
    fetch(`${API_BASE}/api/groups/${id}`, { method: "DELETE", headers: authHeaders(token) }).then(handle),

  addPersonaToGroup: (token, personaId, groupId) =>
    fetch(`${API_BASE}/api/personas/${personaId}/groups/${groupId}`, {
      method: "POST",
      headers: authHeaders(token),
    }).then(handle),
  removePersonaFromGroup: (token, personaId, groupId) =>
    fetch(`${API_BASE}/api/personas/${personaId}/groups/${groupId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }).then(handle),

  maturityCheck: (token, personaId) =>
    fetch(`${API_BASE}/api/personas/${personaId}/maturity-check`, {
      method: "POST",
      headers: authHeaders(token),
    }).then(handle),

  sendChat: (token, personaId, message, sessionId) => {
    const params = new URLSearchParams({ message });
    if (sessionId) params.set("session_id", sessionId);
    return fetch(`${API_BASE}/api/personas/${personaId}/chat?${params}`, {
      method: "POST",
      headers: authHeaders(token),
    }).then(handle);
  },
  listSessions: (token, personaId) =>
    fetch(`${API_BASE}/api/chat/sessions/${personaId}`, { headers: authHeaders(token) }).then(handle),
  listMessages: (token, sessionId) =>
    fetch(`${API_BASE}/api/chat/sessions/${sessionId}/messages`, { headers: authHeaders(token) }).then(handle),
  deleteSession: (token, sessionId) =>
    fetch(`${API_BASE}/api/chat/sessions/${sessionId}`, { method: "DELETE", headers: authHeaders(token) }).then(handle),
  generateSessionInsight: (token, sessionId, framework) =>
    fetch(`${API_BASE}/api/chat/sessions/${sessionId}/insight?${new URLSearchParams({ framework })}`, {
      method: "POST",
      headers: authHeaders(token),
    }).then(handle),
  getSessionInsight: (token, sessionId, framework) =>
    fetch(`${API_BASE}/api/chat/sessions/${sessionId}/insight?${new URLSearchParams({ framework })}`, {
      headers: authHeaders(token),
    }).then(handle),
  saveSessionInsightValidatedRows: (token, sessionId, framework, validatedRows) =>
    fetch(
      `${API_BASE}/api/chat/sessions/${sessionId}/insight/validated-rows?${new URLSearchParams({ framework })}`,
      { method: "PUT", ...jsonBody(token, { validated_rows: validatedRows }) }
    ).then(handle),
  saveSessionInsight: (token, sessionId, framework, { content, validatedRows }) =>
    fetch(`${API_BASE}/api/chat/sessions/${sessionId}/insight?${new URLSearchParams({ framework })}`, {
      method: "PUT",
      ...jsonBody(token, { content, validated_rows: validatedRows }),
    }).then(handle),
  getSessionInsightStatus: (token, sessionId) =>
    fetch(`${API_BASE}/api/chat/sessions/${sessionId}/insight-status`, { headers: authHeaders(token) }).then(handle),

  exportPersona: (token, id) => downloadFile(`${API_BASE}/api/personas/${id}/export`, token, `persona-${id}.json`),

  sendGroupChat: (token, groupId, message, sessionId) => {
    const params = new URLSearchParams({ message });
    if (sessionId) params.set("session_id", sessionId);
    return fetch(`${API_BASE}/api/groups/${groupId}/chat?${params}`, {
      method: "POST",
      headers: authHeaders(token),
    }).then(handle);
  },
  listGroupSessions: (token, groupId) =>
    fetch(`${API_BASE}/api/groups/${groupId}/chat/sessions`, { headers: authHeaders(token) }).then(handle),
  listGroupMessages: (token, sessionId) =>
    fetch(`${API_BASE}/api/group-chat/sessions/${sessionId}/messages`, { headers: authHeaders(token) }).then(handle),
  deleteGroupSession: (token, sessionId) =>
    fetch(`${API_BASE}/api/group-chat/sessions/${sessionId}`, { method: "DELETE", headers: authHeaders(token) }).then(handle),
  generateGroupSessionInsight: (token, sessionId, framework) =>
    fetch(`${API_BASE}/api/group-chat/sessions/${sessionId}/insight?${new URLSearchParams({ framework })}`, {
      method: "POST",
      headers: authHeaders(token),
    }).then(handle),
  getGroupSessionInsight: (token, sessionId, framework) =>
    fetch(`${API_BASE}/api/group-chat/sessions/${sessionId}/insight?${new URLSearchParams({ framework })}`, {
      headers: authHeaders(token),
    }).then(handle),
  saveGroupSessionInsightValidatedRows: (token, sessionId, framework, validatedRows) =>
    fetch(
      `${API_BASE}/api/group-chat/sessions/${sessionId}/insight/validated-rows?${new URLSearchParams({ framework })}`,
      { method: "PUT", ...jsonBody(token, { validated_rows: validatedRows }) }
    ).then(handle),
  saveGroupSessionInsight: (token, sessionId, framework, { content, validatedRows }) =>
    fetch(`${API_BASE}/api/group-chat/sessions/${sessionId}/insight?${new URLSearchParams({ framework })}`, {
      method: "PUT",
      ...jsonBody(token, { content, validated_rows: validatedRows }),
    }).then(handle),
  getGroupSessionInsightStatus: (token, sessionId) =>
    fetch(`${API_BASE}/api/group-chat/sessions/${sessionId}/insight-status`, { headers: authHeaders(token) }).then(handle),

  getFrameworkObjective: (token, framework) =>
    fetch(`${API_BASE}/api/framework-objectives/${encodeURIComponent(framework)}`, {
      headers: authHeaders(token),
    }).then(handle),
};

export { API_BASE };
