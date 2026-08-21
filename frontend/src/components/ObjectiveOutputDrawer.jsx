import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

// Read-only rendering of one of the scope/*.md reference doc's "Helps to
// Identify"/"Output" sections - no selection/copy-paste/add-row machinery,
// since there's nothing to edit here anymore (see load_scope_reference in
// prompts.py, the content's actual source). Renders the section's raw
// Markdown rather than parsing it into a table-only grid, so a section that
// mixes a table with prose (headings, bold lines, a numbered list - e.g.
// Product Design Insight's Evidence/Pattern/Design Implications) still shows
// in full instead of silently losing everything past the first table.
function MarkdownPreview({ markdown }) {
  if (!markdown) {
    return <p className="empty-state">Not documented for this framework yet.</p>;
  }
  return (
    <div className="markdown-body objective-preview">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}

export default function ObjectiveOutputDrawer({ framework, sourceLabel, onClose }) {
  const { token } = useAuth();

  const [input, setInput] = useState(null);
  const [objective, setObjective] = useState("");
  const [helpsToIdentify, setHelpsToIdentify] = useState("");
  const [outputFormat, setOutputFormat] = useState("");
  const [loading, setLoading] = useState(true);
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
        setInput(obj?.input || null);
        setObjective(obj?.objective || "");
        setHelpsToIdentify(obj?.helpsToIdentify || "");
        setOutputFormat(obj?.outputFormat || "");
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, framework]);

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
                  {input || sourceLabel || "Select a chat to see its source shown here."}
                </p>
              </div>

              <div className="objective-grid-wrap">
                Objective
                <p className="objective-preview">{objective || "Not documented for this framework yet."}</p>
              </div>

              <div className="objective-grid-wrap">
                Helps to identify
                <MarkdownPreview markdown={helpsToIdentify} />
              </div>

              <div className="objective-grid-wrap">
                Output
                <MarkdownPreview markdown={outputFormat} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
