import { useEffect, useState } from "react";
import GroupForm from "./GroupForm";

const FORM_ID = "group-drawer-form";

export default function GroupDrawer({ title, group, personas, initialPersonaIds, onSubmit, onClose }) {
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
          <GroupForm
            formId={FORM_ID}
            hideActions
            onBusyChange={setBusy}
            group={group}
            personas={personas}
            initialPersonaIds={initialPersonaIds}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
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
