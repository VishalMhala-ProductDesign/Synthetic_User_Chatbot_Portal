import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import PersonaDrawer from "../components/PersonaDrawer";
import GroupDrawer from "../components/GroupDrawer";

export default function PersonasPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [personas, setPersonas] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editingPersona, setEditingPersona] = useState(null);

  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  const [viewFilter, setViewFilter] = useState("all");

  const loadPersonas = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [personaList, groupList] = await Promise.all([api.listPersonas(token), api.listGroups(token)]);
      setPersonas(personaList);
      setGroups(groupList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPersonas();
  }, [loadPersonas]);

  function openCreate() {
    setEditingPersona(null);
    setFormKey((k) => k + 1);
    setGroupFormOpen(false);
    setFormOpen(true);
  }

  function openEdit(persona) {
    setEditingPersona(persona);
    setFormKey((k) => k + 1);
    setGroupFormOpen(false);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingPersona(null);
  }

  async function handleSubmit(payload) {
    if (editingPersona) {
      const previousGroupIds = editingPersona.group_ids ?? [];
      const nextGroupIds = payload.group_ids ?? [];
      // PUT ignores group_ids, so membership changes must go through the dedicated endpoints.
      const { group_ids: _groupIds, ...updatePayload } = payload;
      await api.updatePersona(token, editingPersona.id, updatePayload);
      await Promise.all([
        ...nextGroupIds
          .filter((id) => !previousGroupIds.includes(id))
          .map((id) => api.addPersonaToGroup(token, editingPersona.id, id)),
        ...previousGroupIds
          .filter((id) => !nextGroupIds.includes(id))
          .map((id) => api.removePersonaFromGroup(token, editingPersona.id, id)),
      ]);
    } else {
      await api.createPersona(token, payload);
    }
    closeForm();
    await loadPersonas();
  }

  async function handleDelete(persona) {
    if (!window.confirm(`Delete persona "${persona.name}"? This cannot be undone.`)) return;
    await api.deletePersona(token, persona.id);
    await loadPersonas();
  }

  function openCreateGroup() {
    setEditingGroup(null);
    closeForm();
    setGroupFormOpen(true);
  }

  function openEditGroup(group) {
    setEditingGroup(group);
    closeForm();
    setGroupFormOpen(true);
  }

  function closeGroupForm() {
    setGroupFormOpen(false);
    setEditingGroup(null);
  }

  async function handleGroupSubmit(payload) {
    if (editingGroup) {
      const previousPersonaIds = personas.filter((p) => p.group_ids?.includes(editingGroup.id)).map((p) => p.id);
      const nextPersonaIds = payload.persona_ids ?? [];
      // PUT ignores persona_ids, so membership changes must go through the dedicated endpoints.
      const { persona_ids: _personaIds, ...updatePayload } = payload;
      await api.updateGroup(token, editingGroup.id, updatePayload);
      await Promise.all([
        ...nextPersonaIds
          .filter((id) => !previousPersonaIds.includes(id))
          .map((id) => api.addPersonaToGroup(token, id, editingGroup.id)),
        ...previousPersonaIds
          .filter((id) => !nextPersonaIds.includes(id))
          .map((id) => api.removePersonaFromGroup(token, id, editingGroup.id)),
      ]);
    } else {
      await api.createGroup(token, payload);
    }
    closeGroupForm();
    await loadPersonas();
  }

  async function handleGroupDelete(group) {
    if (!window.confirm(`Delete group "${group.name}"? Persona membership in this group will be removed.`)) return;
    await api.deleteGroup(token, group.id);
    await loadPersonas();
  }

  return (
    <div className="page personas-page">
      <div className="page-header">
        <h1>Personas and Persona Groups</h1>
        <div className="page-header-actions">
          <select value={viewFilter} onChange={(e) => setViewFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="personas">Personas</option>
            <option value="groups">Persona Group</option>
          </select>
          <button type="button" onClick={openCreateGroup}>
            Create Persona Group
          </button>
          <button type="button" onClick={openCreate}>
            New persona
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {groupFormOpen && (
        <GroupDrawer
          title={editingGroup ? `Edit ${editingGroup.name}` : "Create Persona Group"}
          group={editingGroup}
          personas={personas}
          initialPersonaIds={
            editingGroup ? personas.filter((p) => p.group_ids?.includes(editingGroup.id)).map((p) => p.id) : []
          }
          onSubmit={handleGroupSubmit}
          onClose={closeGroupForm}
        />
      )}

      {formOpen && (
        <PersonaDrawer
          title={editingPersona ? editingPersona.role || editingPersona.name || "Edit persona" : "New persona"}
          formKey={formKey}
          persona={editingPersona}
          groups={groups}
          onSubmit={handleSubmit}
          onClose={closeForm}
          showMaturity={!!editingPersona}
        />
      )}

      {(() => {
        const showPersonas = viewFilter !== "groups";
        const showGroups = viewFilter !== "personas";
        const visiblePersonas = showPersonas ? personas : [];
        const visibleGroups = showGroups ? groups : [];

        if (loading) return <p>Loading…</p>;

        if (visiblePersonas.length === 0 && visibleGroups.length === 0) {
          return (
            <p className="empty-state">
              {viewFilter === "personas"
                ? "No personas yet. Create one to get started."
                : viewFilter === "groups"
                  ? "No groups yet. Groups let you organize personas for filtered comparisons."
                  : "Nothing here yet. Create a persona or a persona group to get started."}
            </p>
          );
        }

        return (
          <div className="card-grid">
            {visiblePersonas.map((persona) => (
              <div
                key={persona.id}
                className="card card-clickable"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/personas/${persona.id}/chat`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/personas/${persona.id}/chat`);
                  }
                }}
              >
                <h3 className="card-title">{persona.role || "Untitled persona"}</h3>
                <p className="card-subtitle">
                  {[persona.name, persona.profession, persona.industry, persona.education]
                    .filter(Boolean)
                    .join(" · ") || "No details yet"}
                </p>
                {persona.maturity_score != null && (
                  <p className="badge">Maturity {persona.maturity_score}/10</p>
                )}
                <div className="card-actions">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(persona);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(persona);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {visibleGroups.map((group) => (
              <div
                key={group.id}
                className="card card-clickable"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/groups/${group.id}/chat`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/groups/${group.id}/chat`);
                  }
                }}
              >
                <h3 className="card-title">{group.name}</h3>
                {group.description && <p className="card-subtitle">{group.description}</p>}
                <p className="badge">
                  {group.persona_count} persona{group.persona_count === 1 ? "" : "s"}
                </p>
                <div className="card-actions">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditGroup(group);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGroupDelete(group);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
