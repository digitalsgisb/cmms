import type { UsageDashboard } from "@sugi-cmms/shared";
import { Activity, CalendarDays, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { formatDateTime } from "../utils/format";

export function SessionTrackerPage() {
  const [dashboard, setDashboard] = useState<UsageDashboard | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async (soft = false) => {
    soft ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      setDashboard(await api.usageDashboard());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn’t load user-session data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return dashboard?.users || [];
    return (dashboard?.users || []).filter((user) =>
      [user.name, user.username, user.role, user.department].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [dashboard, query]);

  return (
    <div className="session-tracker-page">
      <section className="session-tracker-hero">
        <div>
          <p className="eyebrow"><ShieldCheck size={15} /> Developer only</p>
          <h1>User session tracker</h1>
          <p>See which signed-in accounts are opening SUGI CMMS. One open is recorded when the app or browser page starts, not when somebody moves between screens.</p>
        </div>
        <button className="secondary-action" type="button" onClick={() => void loadDashboard(true)} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? "is-spinning" : ""} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </section>

      {error ? <div className="ux-load-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadDashboard()}>Try again</button></div> : null}
      {loading ? <p className="quiet-line" role="status">Loading user sessions…</p> : null}

      {dashboard ? (
        <>
          <section className="session-metric-grid" aria-label="Usage summary">
            <UsageMetric icon={Users} label="Active today" value={dashboard.totals.activeUsersToday} detail={`${dashboard.totals.opensToday} app opens`} />
            <UsageMetric icon={CalendarDays} label="Active in 7 days" value={dashboard.totals.activeUsersLast7Days} detail={`${dashboard.totals.opensLast7Days} app opens`} />
            <UsageMetric icon={Activity} label="Last 30 days" value={dashboard.totals.opensLast30Days} detail="Authenticated app opens" />
            <UsageMetric icon={Activity} label="All time" value={dashboard.totals.opensAllTime} detail="Since tracking was enabled" />
          </section>

          <section className="session-users-panel">
            <div className="session-users-heading">
              <div><p className="eyebrow">Account activity</p><h2>Who is using the system</h2></div>
              <label className="session-user-search"><Search size={16} /><span className="sr-only">Search users</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, username, role…" /></label>
            </div>

            <div className="session-table-wrap">
              <table className="session-table">
                <thead><tr><th>User</th><th>Role</th><th>Today</th><th>7 days</th><th>30 days</th><th>All time</th><th>Last opened</th></tr></thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr key={user.userId}>
                      <td data-label="User"><strong>{user.name}</strong><span>@{user.username} · {user.department}</span></td>
                      <td data-label="Role"><span className={`session-role role-${user.role}`}>{user.role}</span></td>
                      <td data-label="Today">{user.opensToday}</td>
                      <td data-label="7 days">{user.opensLast7Days}</td>
                      <td data-label="30 days">{user.opensLast30Days}</td>
                      <td data-label="All time"><strong>{user.opensAllTime}</strong></td>
                      <td data-label="Last opened">{user.lastOpenedAt ? formatDateTime(user.lastOpenedAt) : <span className="session-never">Not used yet</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleUsers.length ? <p className="session-empty">No accounts match your search.</p> : null}
            </div>
            <p className="session-generated">Updated {formatDateTime(dashboard.generatedAt)} · Guest submissions are not included.</p>
          </section>
        </>
      ) : null}
    </div>
  );
}

function UsageMetric({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: number; detail: string }) {
  return <article className="session-metric"><span><Icon size={20} /></span><div><small>{label}</small><strong>{value.toLocaleString()}</strong><p>{detail}</p></div></article>;
}
