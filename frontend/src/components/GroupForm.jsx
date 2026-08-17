import { useEffect, useState } from "react";

export default function GroupForm({ group, personas, initialPersonaIds, onSubmit, onCancel, formId, hideActions, onBusyChange }) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [personaIds, setPersonaIds] = useState(() => initialPersonaIds ?? []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  function togglePersona(personaId) {
    setPersonaIds((ids) =>
      ids.includes(personaId) ? ids.filter((id) => id !== personaId) : [...ids, personaId]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onSubmit({ name, description, persona_ids: personaIds });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id={formId} className="persona-form" onSubmit={handleSubmit}>
      {error && <div className="error-banner">{error}</div>}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      {personas?.length > 0 && (
        <fieldset className="group-checkboxes">
          <legend>Personas in this group</legend>
          {personas.map((p) => (
            <label key={p.id} className="checkbox-label">
              <input type="checkbox" checked={personaIds.includes(p.id)} onChange={() => togglePersona(p.id)} />
              {p.name}
              {p.role ? ` (${p.role})` : ""}
            </label>
          ))}
        </fieldset>
      )}

      {!hideActions && (
        <div className="form-actions">
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}
