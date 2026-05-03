import { useEffect, useMemo, useState } from 'react';
import { getAdminSummary, updateAdminUser } from '../api/admin.js';
import { supabase } from '../api/supabase.js';

const PLANS = ['free', 'basic', 'pro', 'premium'];
const STATUSES = ['active', 'trialing', 'past_due', 'cancelled'];
const ROLES = ['user', 'admin'];

export function AdminPage() {
  const [session, setSession] = useState(null);
  const [auth, setAuth] = useState({ email: '', password: '', loading: true, error: null });
  const [state, setState] = useState({ loading: false, error: null, data: null });
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session || null);
      setAuth((current) => ({ ...current, loading: false }));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    loadSummary(session.access_token);
  }, [session?.access_token]);

  async function login(event) {
    event.preventDefault();
    setAuth((current) => ({ ...current, loading: true, error: null }));
    const { data, error } = await supabase.auth.signInWithPassword({
      email: auth.email.trim(),
      password: auth.password,
    });
    if (error) {
      setAuth((current) => ({ ...current, loading: false, error: error.message }));
      return;
    }
    setSession(data.session);
    setAuth((current) => ({ ...current, password: '', loading: false, error: null }));
  }

  async function logout() {
    await supabase.auth.signOut();
    setSession(null);
    setState({ loading: false, error: null, data: null });
  }

  async function loadSummary(token = session?.access_token) {
    if (!token) return;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await getAdminSummary(token);
      setState({ loading: false, error: null, data });
    } catch (error) {
      setState({ loading: false, error, data: null });
    }
  }

  async function saveUser(userId, data) {
    setSaving(userId);
    try {
      await updateAdminUser(session.access_token, userId, data);
      await loadSummary();
    } catch (error) {
      setState((current) => ({ ...current, error }));
    } finally {
      setSaving(null);
    }
  }

  const users = useMemo(() => {
    const rows = state.data?.users || [];
    const cleaned = query.trim().toLowerCase();
    return cleaned
      ? rows.filter((user) => `${user.email || ''} ${user.plan || ''} ${user.role || ''}`.toLowerCase().includes(cleaned))
      : rows;
  }, [query, state.data?.users]);

  if (auth.loading && !session) return <section className="panel"><div className="loadingGrid">Carregando admin...</div></section>;
  if (!session) {
    return (
      <section className="adminLogin panel">
        <div>
          <span>Admin</span>
          <h2>Entrar no painel</h2>
          <p>Use uma conta com `role=admin` na tabela `subscriptions`.</p>
        </div>
        <form onSubmit={login}>
          <label>
            Email
            <input value={auth.email} onChange={(event) => setAuth((current) => ({ ...current, email: event.target.value }))} type="email" autoComplete="email" />
          </label>
          <label>
            Senha
            <input value={auth.password} onChange={(event) => setAuth((current) => ({ ...current, password: event.target.value }))} type="password" autoComplete="current-password" />
          </label>
          {auth.error ? <div className="alertBox">{auth.error}</div> : null}
          <button type="submit" disabled={auth.loading}>{auth.loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </section>
    );
  }

  const metrics = state.data?.metrics || {};

  return (
    <section className="adminPage panel">
      <div className="panelHeader">
        <div>
          <h2>Admin</h2>
          <p className="sectionLead visible">Assinaturas, planos e usuarios do StatCast BR.</p>
        </div>
        <div className="adminActions">
          <span>{state.data?.admin?.email || session.user?.email}</span>
          <button type="button" onClick={() => loadSummary()} disabled={state.loading}>Atualizar</button>
          <button type="button" onClick={logout}>Sair</button>
        </div>
      </div>

      {state.error ? <div className="alertBox">{state.error.message}</div> : null}
      {state.loading && !state.data ? <div className="loadingGrid">Carregando painel...</div> : null}

      {state.data ? (
        <>
          <div className="adminMetrics">
            <AdminMetric label="Usuarios" value={metrics.total ?? 0} />
            <AdminMetric label="Pagantes" value={metrics.paid ?? 0} />
            <AdminMetric label="Free" value={metrics.free ?? 0} />
            <AdminMetric label="MRR" value={`R$${metrics.mrr ?? 0}`} />
          </div>

          <PlanDistribution users={state.data.users || []} />

          <div className="adminToolbar">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar email, plano ou role..." />
            <span>{users.length} usuarios</span>
          </div>

          <div className="adminTableWrap">
            <table className="adminTable">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Plano</th>
                  <th>Status</th>
                  <th>Role</th>
                  <th>Desde</th>
                  <th>Controle</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <AdminUserRow key={user.user_id} user={user} saving={saving === user.user_id} onSave={saveUser} />
                ))}
              </tbody>
            </table>
            {!users.length ? <div className="emptyState">Nenhum usuario encontrado.</div> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function AdminMetric({ label, value }) {
  return (
    <div className="adminMetric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PlanDistribution({ users }) {
  const counts = PLANS.map((plan) => ({
    plan,
    count: users.filter((user) => user.plan === plan).length,
  }));
  const total = users.length || 1;
  return (
    <section className="adminPlanBox">
      <div className="ftModalTitle">Distribuicao de planos</div>
      {counts.map((item) => (
        <div className="adminPlanRow" key={item.plan}>
          <span>{item.plan}</span>
          <div><i style={{ width: `${Math.round((item.count / total) * 100)}%` }} /></div>
          <strong>{item.count}</strong>
        </div>
      ))}
    </section>
  );
}

function AdminUserRow({ user, saving, onSave }) {
  const [plan, setPlan] = useState(user.plan || 'free');
  const [status, setStatus] = useState(user.status || 'active');
  const [role, setRole] = useState(user.role || 'user');
  const changed = plan !== user.plan || status !== user.status || role !== (user.role || 'user');
  return (
    <tr>
      <td>{user.email}</td>
      <td><span className={`adminPlanPill ${user.plan || 'free'}`}>{user.plan || 'free'}</span></td>
      <td>{user.status || '-'}</td>
      <td className={user.role === 'admin' ? 'adminRole' : ''}>{user.role || 'user'}</td>
      <td>{formatDate(user.created_at)}</td>
      <td>
        <div className="adminPlanEdit">
          <select value={plan} onChange={(event) => setPlan(event.target.value)}>
            {PLANS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            {ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button type="button" disabled={!changed || saving} onClick={() => onSave(user.user_id, { plan, status, role })}>
            {saving ? '...' : 'Salvar'}
          </button>
        </div>
      </td>
    </tr>
  );
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}
