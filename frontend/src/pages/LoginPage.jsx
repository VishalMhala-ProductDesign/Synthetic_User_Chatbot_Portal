import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Chrome ignores autoComplete="off" on login forms and paints in a saved
  // credential anyway. Its autofill applies a `:-webkit-autofill` style, which
  // we hook via a CSS animation (see index.css) to detect the moment it fires
  // and immediately clear the field back out.
  function clearIfAutofilled(e, setter) {
    if (e.animationName === "autofill-detect") {
      setter("");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/personas");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit} autoComplete="off">
        <h1>Log in</h1>
        {error && <div className="error-banner">{error}</div>}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onAnimationStart={(e) => clearIfAutofilled(e, setEmail)}
            autoComplete="off"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onAnimationStart={(e) => clearIfAutofilled(e, setPassword)}
            autoComplete="off"
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p>
          No account? <Link to="/signup">Sign up</Link>
        </p>
      </form>
    </div>
  );
}
