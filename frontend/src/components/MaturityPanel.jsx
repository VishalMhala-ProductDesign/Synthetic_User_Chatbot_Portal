import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

function maturityStatusLabel(score) {
  if (score >= 8) return "Strong";
  if (score >= 5) return "Fair";
  return "Needs work";
}

export default function MaturityPanel({ personaId, initialMaturity }) {
  const { token } = useAuth();
  const [maturity, setMaturity] = useState(initialMaturity ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function runCheck() {
    setBusy(true);
    setError("");
    try {
      const result = await api.maturityCheck(token, personaId);
      setMaturity(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Maturity status</h2>
        <button type="button" onClick={runCheck} disabled={busy}>
          {busy ? "Checking…" : "Check Maturity"}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {maturity && (
        <>
          <p className="badge">
            Status: {maturityStatusLabel(maturity.score)} ({maturity.score}/10)
          </p>
          {maturity.suggestions.length === 0 ? (
            <p className="empty-state">No suggestions — persona looks internally consistent.</p>
          ) : (
            <ul className="suggestion-list">
              {maturity.suggestions.map((s, i) => (
                <li key={i}>
                  <p className="suggestion-text">{s.suggestion}</p>
                  <p className="suggestion-meta">
                    <span className="tag">{s.basis_type}</span>
                    {s.fields_compared?.map((f) => (
                      <span key={f} className="tag">
                        {f}
                      </span>
                    ))}
                  </p>
                  <p className="suggestion-reasoning">{s.reasoning}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
