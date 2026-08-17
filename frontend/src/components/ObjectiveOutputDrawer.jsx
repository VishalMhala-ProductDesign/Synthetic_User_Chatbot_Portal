import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

const EMPTY_GRID = [
  ["", ""],
  ["", ""],
];

// Most frameworks' actual input is this specific chat's transcript, so "Input
// to <framework>" shows the concrete chat/session traceability label. A few
// frameworks instead read a prior framework's output (e.g. JTBD Analysis is
// built from the Empathy Mapping insight, not the raw chat - see
// generate_session_insight in main.py) - for those, show that fixed
// description instead, since a per-chat label would misrepresent what's
// actually fed into generation.
const FIXED_INPUT_LABELS = {
  "JTBD Analysis": "User Insight from Empathy Mapping",
  "User Journey Mapping": "Jobs + goals from JTBD Analysis",
  "Task Flow Analysis": "Journey stages and User Goal, Activities / Actions, THINKS, FEELS, "
    + "Pain Points / Friction, Key Decision, Opportunity from User Journey Mapping",
};

function normalizeGrid(grid) {
  if (!Array.isArray(grid) || grid.length === 0) return EMPTY_GRID.map((row) => [...row]);
  return grid;
}

function EditableGrid({ grid, setGrid, allowColumns, headerRow }) {
  const colCount = grid[0]?.length || 0;

  // Excel-style range selection: click a cell to select it, drag to extend the
  // range, Ctrl/Cmd+A to select the whole grid. Selected range is copyable as
  // tab/newline-delimited text and pasteable back over the grid from that anchor.
  const [selection, setSelection] = useState(null); // { r1, c1, r2, c2 }
  const draggingRef = useRef(false);

  useEffect(() => {
    function stopDragging() {
      draggingRef.current = false;
    }
    window.addEventListener("mouseup", stopDragging);
    return () => window.removeEventListener("mouseup", stopDragging);
  }, []);

  function selectionBounds() {
    if (!selection) return null;
    return {
      minR: Math.min(selection.r1, selection.r2),
      maxR: Math.max(selection.r1, selection.r2),
      minC: Math.min(selection.c1, selection.c2),
      maxC: Math.max(selection.c1, selection.c2),
    };
  }

  function isSelected(rowIndex, colIndex) {
    const b = selectionBounds();
    return !!b && rowIndex >= b.minR && rowIndex <= b.maxR && colIndex >= b.minC && colIndex <= b.maxC;
  }

  function handleCellMouseDown(rowIndex, colIndex) {
    draggingRef.current = true;
    setSelection({ r1: rowIndex, c1: colIndex, r2: rowIndex, c2: colIndex });
  }

  function handleCellMouseEnter(rowIndex, colIndex) {
    if (!draggingRef.current) return;
    setSelection((prev) => (prev ? { ...prev, r2: rowIndex, c2: colIndex } : { r1: rowIndex, c1: colIndex, r2: rowIndex, c2: colIndex }));
  }

  function handleGridKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelection({ r1: 0, c1: 0, r2: grid.length - 1, c2: colCount - 1 });
    }
  }

  function handleGridCopy(e) {
    const b = selectionBounds();
    if (!b || (b.minR === b.maxR && b.minC === b.maxC)) return; // single cell — let native copy of any selected text happen
    const text = grid
      .slice(b.minR, b.maxR + 1)
      .map((row) => row.slice(b.minC, b.maxC + 1).join("\t"))
      .join("\n");
    e.clipboardData.setData("text/plain", text);
    e.preventDefault();
  }

  function handleGridPaste(e) {
    const b = selectionBounds();
    if (!b) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const rows = text.replace(/\r/g, "").split("\n");
    while (rows.length > 1 && rows[rows.length - 1] === "") rows.pop();
    const cells = rows.map((row) => row.split("\t"));
    if (cells.length === 1 && cells[0].length === 1) return; // single value — let native paste into the focused cell happen
    e.preventDefault();
    setGrid((prev) =>
      prev.map((row, r) =>
        row.map((cell, c) => {
          const ri = r - b.minR;
          const ci = c - b.minC;
          return ri >= 0 && ci >= 0 && ri < cells.length && ci < cells[ri].length ? cells[ri][ci] : cell;
        })
      )
    );
  }

  function updateCell(rowIndex, colIndex, value) {
    setGrid((prev) => prev.map((row, r) => (r !== rowIndex ? row : row.map((cell, c) => (c !== colIndex ? cell : value)))));
  }

  function addRow() {
    setGrid((prev) => [...prev, Array(prev[0]?.length || 1).fill("")]);
  }

  function removeRow(rowIndex) {
    setGrid((prev) => (prev.length <= 1 ? prev : prev.filter((_, r) => r !== rowIndex)));
  }

  function addColumn() {
    setGrid((prev) => prev.map((row) => [...row, ""]));
  }

  function removeColumn(colIndex) {
    setGrid((prev) => (prev[0]?.length <= 1 ? prev : prev.map((row) => row.filter((_, c) => c !== colIndex))));
  }

  return (
    <>
      <div
        className="objective-grid-table-wrap"
        onKeyDown={handleGridKeyDown}
        onCopy={handleGridCopy}
        onPaste={handleGridPaste}
      >
        <table className="objective-grid">
          <tbody>
            {grid.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => {
                  const isHeaderCell = headerRow && rowIndex === 0;
                  return (
                    <td
                      key={colIndex}
                      className={[
                        isHeaderCell ? "objective-grid-header-cell" : "",
                        isSelected(rowIndex, colIndex) ? "objective-grid-cell-selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined}
                      onMouseDown={() => handleCellMouseDown(rowIndex, colIndex)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
                    >
                      <input
                        type="text"
                        value={cell}
                        onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                        placeholder={isHeaderCell ? "Column title" : undefined}
                      />
                    </td>
                  );
                })}
                <td className="objective-grid-row-actions">
                  <button
                    type="button"
                    className="danger objective-grid-remove"
                    onClick={() => removeRow(rowIndex)}
                    disabled={grid.length <= 1}
                    aria-label="Remove row"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {allowColumns && (
              <tr>
                {Array.from({ length: colCount }, (_, colIndex) => (
                  <td key={colIndex} className="objective-grid-col-actions">
                    <button
                      type="button"
                      className="danger objective-grid-remove"
                      onClick={() => removeColumn(colIndex)}
                      disabled={colCount <= 1}
                      aria-label="Remove column"
                    >
                      ×
                    </button>
                  </td>
                ))}
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="objective-grid-controls">
        <button type="button" onClick={addRow}>
          + Row
        </button>
        {allowColumns && (
          <button type="button" onClick={addColumn}>
            + Column
          </button>
        )}
      </div>
    </>
  );
}

export default function ObjectiveOutputDrawer({ framework, sourceLabel, onClose }) {
  const { token } = useAuth();

  const [objective, setObjective] = useState("");
  const [helpsToIdentify, setHelpsToIdentify] = useState(EMPTY_GRID);
  const [outputFormat, setOutputFormat] = useState(EMPTY_GRID);
  const [example, setExample] = useState(EMPTY_GRID);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .getFrameworkObjective(token, framework)
      .then((obj) => {
        if (cancelled) return;
        setObjective(obj?.objective || "");
        setHelpsToIdentify(normalizeGrid(obj?.helpsToIdentify));
        setOutputFormat(normalizeGrid(obj?.outputFormat));
        setExample(normalizeGrid(obj?.example));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, framework]);

  async function handleSaveAndClose() {
    setBusy(true);
    setError("");
    try {
      await api.saveFrameworkObjective(token, framework, { objective, helpsToIdentify, outputFormat, example });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="drawer-overlay">
      <div className="drawer-panel drawer-panel-wide">
        <div className="drawer-header">
          <h2>Objective & Output — {framework}</h2>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawer-body">
          {error && <div className="error-banner">{error}</div>}
          {loading ? (
            <p className="empty-state">Loading…</p>
          ) : (
            <>
              <div className="objective-grid-wrap">
                Input to {framework}
                <p className="objective-preview">
                  {FIXED_INPUT_LABELS[framework] || sourceLabel || "Select a chat to see its source shown here."}
                </p>
              </div>

              <label>
                Objective
                <textarea
                  rows={5}
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder={`What should ${framework} insights focus on?`}
                />
              </label>

              <div className="objective-grid-wrap">
                Helps to identify
                <EditableGrid grid={helpsToIdentify} setGrid={setHelpsToIdentify} allowColumns={false} headerRow />
              </div>

              <div className="objective-grid-wrap">
                Output
                <EditableGrid grid={outputFormat} setGrid={setOutputFormat} allowColumns />
              </div>

              <div className="objective-grid-wrap">
                Example
                <EditableGrid grid={example} setGrid={setExample} allowColumns />
              </div>
            </>
          )}
        </div>

        <div className="drawer-footer">
          <button type="button" className="btn-primary" onClick={handleSaveAndClose} disabled={busy || loading}>
            {busy ? "Saving…" : "Save & Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
