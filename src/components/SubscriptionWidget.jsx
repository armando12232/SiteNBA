import { useEffect, useMemo, useState } from 'react';
import {
  PLANS,
  getCurrentSession,
  loadSubscription,
  signIn,
  signOut,
  signUp,
  startCheckout,
} from '../api/subscriptions.js';
import { supabase } from '../api/supabase.js';

export function SubscriptionWidget({ onSubscriptionChange }) {
  const [session, setSession] = useState(null);
  const [subscription, setSubscription] = useState({ plan: 'free', status: 'active', role: 'guest', label: 'Free' });
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function boot() {
      const nextSession = await getCurrentSession();
      if (!alive) return;
      setSession(nextSession);
      await refreshSubscription(nextSession, setSubscription);
      setLoading(false);
    }
    boot();
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      refreshSubscription(nextSession, setSubscription);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    onSubscriptionChange?.({ session, subscription });
  }, [onSubscriptionChange, session, subscription]);

  const plan = PLANS[subscription.plan] || PLANS.free;

  return (
    <div className="subWidget">
      <button type="button" className={`planBadge plan-${subscription.plan}`} onClick={() => setModal('pricing')}>
        {loading ? 'Plano' : plan.name}
      </button>
      {session ? (
        <>
          <span className="subEmail">{session.user?.email}</span>
          <button type="button" className="subBtn ghost" onClick={() => signOut()}>Sair</button>
        </>
      ) : (
        <button type="button" className="subBtn" onClick={() => setModal('auth')}>Entrar</button>
      )}
      {modal === 'auth' ? <AuthModal onClose={() => setModal(null)} /> : null}
      {modal === 'pricing' ? (
        <PricingModal
          currentPlan={subscription.plan}
          hasSession={Boolean(session)}
          onNeedAuth={() => setModal('auth')}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

async function refreshSubscription(session, setSubscription) {
  try {
    const next = await loadSubscription(session?.user?.id);
    setSubscription(next);
  } catch {
    setSubscription({ plan: 'free', status: 'active', role: session ? 'user' : 'guest', label: 'Free' });
  }
}

function AuthModal({ onClose }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const action = mode === 'login' ? signIn : signUp;
    const { error } = await action(email.trim(), password);
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(mode === 'login' ? 'Login feito.' : 'Conta criada. Confirme email se Supabase pedir.');
    setTimeout(onClose, 500);
  }

  return (
    <div className="subOverlay" onMouseDown={onClose}>
      <section className="subModal auth" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="subClose" onClick={onClose}>x</button>
        <div className="subKicker">Conta</div>
        <h3>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h3>
        <form className="authForm" onSubmit={submit}>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="email" required />
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="senha" minLength={6} required />
          {message ? <div className="authMessage">{message}</div> : null}
          <button type="submit" disabled={busy}>{busy ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        </form>
        <button type="button" className="linkBtn" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Criar conta nova' : 'Já tenho conta'}
        </button>
      </section>
    </div>
  );
}

function PricingModal({ currentPlan, hasSession, onNeedAuth, onClose }) {
  const [busyPlan, setBusyPlan] = useState('');
  const paidPlans = useMemo(() => Object.entries(PLANS).filter(([key]) => key !== 'free'), []);

  async function selectPlan(plan) {
    if (!hasSession) {
      onNeedAuth();
      return;
    }
    setBusyPlan(plan);
    try {
      const data = await startCheckout(plan);
      if (data?.url) window.location.href = data.url;
    } catch (error) {
      alert(error.message);
      setBusyPlan('');
    }
  }

  return (
    <div className="subOverlay" onMouseDown={onClose}>
      <section className="subModal pricing" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="subClose" onClick={onClose}>x</button>
        <div className="subKicker">Assinaturas</div>
        <h3>Escolha seu plano</h3>
        <div className="pricingGrid">
          {paidPlans.map(([key, plan]) => {
            const current = currentPlan === key;
            return (
              <article className={`pricingCard ${plan.popular ? 'popular' : ''} ${current ? 'current' : ''}`} key={key}>
                {plan.popular ? <span className="popularTag">Mais usado</span> : null}
                <strong>{plan.name}</strong>
                <div className="planPrice">{plan.label}</div>
                <ul>
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
                <button type="button" disabled={current || busyPlan === key} onClick={() => selectPlan(key)}>
                  {current ? 'Plano atual' : busyPlan === key ? 'Abrindo Stripe...' : 'Assinar'}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
