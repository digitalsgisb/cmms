import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import type { User } from "@sugi-cmms/shared";
import { useCurrentUser } from "../state/UserContext";

export function LoginPage() {
  const { users, currentUser, loadingUsers, login } = useCurrentUser();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";

  const demoUsers = useMemo(() => {
    const preferredRoles: User["role"][] = ["admin", "executive", "technician", "requester"];
    return preferredRoles
      .map((role) => users.find((user) => user.role === role))
      .filter((user): user is User => Boolean(user));
  }, [users]);

  if (!loadingUsers && currentUser) {
    return <Navigate to={preferredLandingPath(currentUser, from)} replace />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter username and password.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const user = await login(username, password);
      navigate(preferredLandingPath(user, from), { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(user: User) {
    setUsername(user.username);
    setPassword(defaultPasswordForRole(user.role));
    setError("");
  }

  return (
    <main className="login-shell">
      <section className="login-brand-panel">
        <img src="/brand/sugi_mark_white.png" alt="Sugihara Grand Industries" />
        <div>
          <p className="hero-eyebrow">
            <span aria-hidden="true" />
            Factory Maintenance Control
          </p>
          <h1>SUGI CMMS</h1>
          <p>Maintenance command center for work orders, response tracking, and shop-floor visibility.</p>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-panel-header">
          <span>
            <LockKeyhole size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Secure session</p>
            <h2 id="login-title">Sign in</h2>
          </div>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="login-field">
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="admin" autoComplete="username" />
          </label>

          <label className="login-field">
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" autoComplete="current-password" />
          </label>

          {error ? <p className="error-line">{error}</p> : null}

          <button className="login-submit" type="submit" disabled={loadingUsers || submitting || !username.trim() || !password}>
            {submitting ? "Signing in..." : "Sign in"}
            <ArrowRight size={18} aria-hidden="true" />
          </button>

          <div className="login-demo-panel">
            <span>Development accounts</span>
            <div className="login-user-grid">
              {demoUsers.map((user) => (
                <button className="login-user-card compact" key={user.id} type="button" onClick={() => fillDemo(user)}>
                  <UserRound size={17} aria-hidden="true" />
                  <span>
                    <strong>{user.username}</strong>
                    <small>{user.role} / {defaultPasswordForRole(user.role)}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}

function preferredLandingPath(user: User, from: string) {
  if (user.role === "technician" && from === "/") {
    return "/technician";
  }

  return from;
}

function defaultPasswordForRole(role: User["role"]) {
  if (role === "admin") {
    return "admin123";
  }

  if (role === "executive") {
    return "exec123";
  }

  if (role === "technician") {
    return "tech123";
  }

  return "requester123";
}
