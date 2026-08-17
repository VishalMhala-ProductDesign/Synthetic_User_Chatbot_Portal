import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

const BLANK = {
  name: "",
  age: "",
  industry: "",
  education: "",
  profession: "",
  experience_years: "",
  role: "",
  custom_attributes: "",
};

// Custom attributes are stored as a dict on the backend (prompts.py renders each
// entry as "- key: value" in the persona's system prompt). The textarea is plain
// text so researchers don't have to write JSON: a "key: value" line becomes a
// structured attribute, a plain line is kept as free-form text under a synthetic
// key so it still round-trips.
function customAttributesToText(attrs) {
  if (!attrs) return "";
  return Object.entries(attrs)
    .map(([key, value]) => (/^note_\d+$/.test(key) ? String(value) : `${key}: ${value}`))
    .join("\n");
}

function textToCustomAttributes(text) {
  const result = {};
  let noteCount = 0;
  text.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      result[line.slice(0, colonIndex).trim()] = line.slice(colonIndex + 1).trim();
    } else {
      noteCount += 1;
      result[`note_${noteCount}`] = line;
    }
  });
  return result;
}

function personaToFormState(persona) {
  if (!persona) return { ...BLANK, group_ids: [] };
  return {
    name: persona.name ?? "",
    age: persona.age ?? "",
    industry: persona.industry ?? "",
    education: persona.education ?? "",
    profession: persona.profession ?? "",
    experience_years: persona.experience_years ?? "",
    role: persona.role ?? "",
    custom_attributes: customAttributesToText(persona.custom_attributes),
    group_ids: persona.group_ids ?? [],
  };
}

export default function PersonaForm({ persona, groups, onSubmit, onCancel, formId, hideActions, onBusyChange }) {
  const { token } = useAuth();
  const [form, setForm] = useState(() => personaToFormState(persona));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError("");
    try {
      const generated = await api.generatePersona(token, description);
      setForm((f) => ({
        ...f,
        name: generated.name ?? f.name,
        age: generated.age ?? f.age,
        industry: generated.industry ?? f.industry,
        education: generated.education ?? f.education,
        profession: generated.profession ?? f.profession,
        role: generated.role ?? f.role,
        experience_years: generated.experience_years ?? f.experience_years,
        custom_attributes: customAttributesToText(generated.custom_attributes) || f.custom_attributes,
      }));
      setGenerateOpen(false);
      setDescription("");
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleGroup(groupId) {
    setForm((f) => ({
      ...f,
      group_ids: f.group_ids.includes(groupId)
        ? f.group_ids.filter((id) => id !== groupId)
        : [...f.group_ids, groupId],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onSubmit({
        name: form.name,
        age: form.age === "" ? null : Number(form.age),
        industry: form.industry,
        education: form.education,
        profession: form.profession,
        experience_years: form.experience_years === "" ? null : Number(form.experience_years),
        role: form.role,
        custom_attributes: textToCustomAttributes(form.custom_attributes),
        group_ids: form.group_ids,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id={formId} className="persona-form" onSubmit={handleSubmit}>
      {error && <div className="error-banner">{error}</div>}

      {!persona && (
        <div className="ai-generate-block">
          {!generateOpen ? (
            <button type="button" onClick={() => setGenerateOpen(true)}>
              Generate with AI
            </button>
          ) : (
            <div className="ai-generate-panel">
              {generateError && <div className="error-banner">{generateError}</div>}
              <label>
                Describe who you need
                <textarea
                  rows={3}
                  placeholder='e.g. "Congestion Analysis persona who helps understand why congestion occurs on the system and how it impacts nodal pricing."'
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <div className="form-actions">
                <button type="button" onClick={handleGenerate} disabled={generating || !description.trim()}>
                  {generating ? "Generating…" : "Generate"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGenerateOpen(false);
                    setDescription("");
                    setGenerateError("");
                  }}
                  disabled={generating}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="form-grid">
        <label>
          Name
          <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
        </label>
        <label>
          Age
          <input type="number" min="0" value={form.age} onChange={(e) => update("age", e.target.value)} />
        </label>
        <label>
          Industry
          <input value={form.industry} onChange={(e) => update("industry", e.target.value)} />
        </label>
        <label>
          Education
          <input value={form.education} onChange={(e) => update("education", e.target.value)} />
        </label>
        <label>
          Profession
          <input value={form.profession} onChange={(e) => update("profession", e.target.value)} />
        </label>
        <label>
          Role
          <input value={form.role} onChange={(e) => update("role", e.target.value)} />
        </label>
        <label>
          Experience (years)
          <input
            type="number"
            min="0"
            value={form.experience_years}
            onChange={(e) => update("experience_years", e.target.value)}
          />
        </label>
      </div>

      <label>
        Notes / custom attributes
        <textarea
          rows={5}
          placeholder={"Free-form notes about this persona, or one attribute per line, e.g.\nrisk_tolerance: low"}
          value={form.custom_attributes}
          onChange={(e) => update("custom_attributes", e.target.value)}
        />
      </label>

      {groups.length > 0 && (
        <fieldset className="group-checkboxes">
          <legend>Groups</legend>
          {groups.map((g) => (
            <label key={g.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={form.group_ids.includes(g.id)}
                onChange={() => toggleGroup(g.id)}
              />
              {g.name}
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
