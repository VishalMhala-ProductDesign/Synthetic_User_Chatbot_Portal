import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import PersonaDrawer from "../components/PersonaDrawer";
import ConfirmDialog from "../components/ConfirmDialog";

const FIELD_LABELS = {
  age: "Age",
  industry: "Industry",
  education: "Education",
  profession: "Profession",
  experience_years: "Experience (years)",
  role: "Role",
};

export default function PersonaDetailPage() {
  const { personaId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [persona, setPersona] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [personaData, groupList] = await Promise.all([api.getPersona(token, personaId), api.listGroups(token)]);
      setPersona(personaData);
      setGroups(groupList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, personaId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpdate(payload) {
    const previousGroupIds = persona.group_ids ?? [];
    const nextGroupIds = payload.group_ids ?? [];
    const { group_ids: _groupIds, ...updatePayload } = payload;
    await api.updatePersona(token, personaId, updatePayload);
    await Promise.all([
      ...nextGroupIds
        .filter((id) => !previousGroupIds.includes(id))
        .map((id) => api.addPersonaToGroup(token, personaId, id)),
      ...previousGroupIds
        .filter((id) => !nextGroupIds.includes(id))
        .map((id) => api.removePersonaFromGroup(token, personaId, id)),
    ]);
    setEditing(false);
    await load();
  }

  async function handleDelete() {
    await api.deletePersona(token, personaId);
    navigate("/personas");
  }

  async function handleExport() {
    setExportBusy(true);
    try {
      await api.exportPersona(token, personaId);
    } catch (err) {
      setError(err.message);
    } finally {
      setExportBusy(false);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!persona) return null;

  const memberGroups = groups.filter((g) => persona.group_ids?.includes(g.id));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{persona.name}</h1>
        </div>
        <div className="page-header-actions">
          <Link to={`/personas/${personaId}/chat`}>
            <button type="button" className="btn-primary">
              Chat
            </button>
          </Link>
          <button type="button" onClick={handleExport} disabled={exportBusy}>
            {exportBusy ? "Exporting…" : "Export persona"}
          </button>
          <button type="button" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel edit" : "Edit"}
          </button>
          <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          message={`Delete persona "${persona.name}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {editing && (
        <PersonaDrawer
          title={persona.role || persona.name || "Edit persona"}
          formKey={personaId}
          persona={persona}
          groups={groups}
          onSubmit={handleUpdate}
          onClose={() => setEditing(false)}
          showMaturity
        />
      )}

      {!editing && (
        <div className="panel">
          <dl className="field-list">
            {Object.entries(FIELD_LABELS).map(([field, label]) => (
              <div key={field}>
                <dt>{label}</dt>
                <dd>{persona[field] || "—"}</dd>
              </div>
            ))}
          </dl>

          {persona.custom_attributes && Object.keys(persona.custom_attributes).length > 0 && (
            <>
              <h3>Notes / custom attributes</h3>
              <dl className="field-list">
                {Object.entries(persona.custom_attributes).map(([key, value]) =>
                  /^note_\d+$/.test(key) ? (
                    <div key={key} className="field-note">
                      <dd>{String(value)}</dd>
                    </div>
                  ) : (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  )
                )}
              </dl>
            </>
          )}

          {memberGroups.length > 0 && (
            <>
              <h3>Groups</h3>
              <div className="tag-row">
                {memberGroups.map((g) => (
                  <span key={g.id} className="tag">
                    {g.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
