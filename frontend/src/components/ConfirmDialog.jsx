export default function ConfirmDialog({ message, confirmLabel = "Delete", onConfirm, onCancel }) {
  return (
    <div className="close-confirm-overlay" onClick={onCancel}>
      <div className="close-confirm-panel" onClick={(e) => e.stopPropagation()}>
        <p>{message}</p>
        <div className="close-confirm-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
