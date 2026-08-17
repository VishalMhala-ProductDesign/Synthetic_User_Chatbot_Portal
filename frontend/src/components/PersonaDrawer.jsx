import { useEffect, useState } from "react";
import PersonaForm from "./PersonaForm";
import MaturityPanel from "./MaturityPanel";

const FORM_ID = "persona-drawer-form";

export default function PersonaDrawer({ title, persona, groups, onSubmit, onClose, showMaturity, formKey }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>{title}</h2>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawer-body">
          <PersonaForm
            key={formKey}
            formId={FORM_ID}
            hideActions
            onBusyChange={setBusy}
            persona={persona}
            groups={groups}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
          {showMaturity && (
            <MaturityPanel
              key={persona.id}
              personaId={persona.id}
              initialMaturity={
                persona.maturity_score != null
                  ? { score: persona.maturity_score, suggestions: persona.maturity_notes ? JSON.parse(persona.maturity_notes) : [] }
                  : null
              }
            />
          )}
        </div>

        <div className="drawer-footer">
          <button type="submit" form={FORM_ID} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
