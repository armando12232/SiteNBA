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
import { SUPABASE_CONFIGURED, supabase } from '../api/supabase.js';
import { userErrorMessage } from '../utils/errors.js';

export function SubscriptionWidget({ onSubscriptionChange }) {
  const [session, setSession] = useState(null);
  const [subscription, setSubscription] = useState({ plan: 'free', status: 'active', role: 'guest', label: 'Free' });
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!SUPABASE_CONFIGURED) {
        if (alive) setLoading(false);
        return;
      }
      const nextSession = await getCurrentSession();
      if (!alive) return;
      setSession(nextSession);
      await refreshSubscription(nextSession, setSubscription);
      setLoading(false);
    }
    boot();
    if (!SUPABASE_CONFIGURED) {
      return () => {
        alive = false;
      };
    }
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
    function openPricing() {
      setModal('pricing');
    }
    window.addEventListener('statcast:open-pricing', openPricing);
    return () => window.removeEventListener('statcast:open-pricing', openPricing);
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
      setMessage(userErrorMessage(error, mode === 'login' ? 'Não foi possível entrar agora.' : 'Não foi possível criar a conta agora.'));
      return;
    }
    setMessage(mode === 'login' ? 'Login feito.' : 'Conta criada. Confirme o e-mail se solicitado.');
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
  const [error, setError] = useState('');
  const paidPlans = useMemo(() => Object.entries(PLANS).filter(([key]) => key !== 'free'), []);

  async function selectPlan(plan) {
    setError('');
    if (!hasSession) {
      onNeedAuth();
      return;
    }
    setBusyPlan(plan);
    try {
      const data = await startCheckout(plan);
      if (data?.url) window.location.href = data.url;
    } catch (error) {
      setError(userErrorMessage(error, 'Não foi possível abrir o checkout agora.'));
      setBusyPlan('');
    }
  }

  return (
    <div className="subOverlay" onMouseDown={onClose}>
      <section className="subModal pricing" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="subClose" onClick={onClose}>x</button>
        <div className="subKicker">Assinaturas</div>
        <h3>Escolha seu plano</h3>
        <p className="pricingLead">Free mostra uma amostra. Basic libera estudo NBA. Pro libera a operação completa. Premium adiciona leitura por confronto.</p>
        {error ? <div className="authMessage pricingError">{error}</div> : null}
        <div className="pricingCompare">
          <CompareItem title="Free" text="Preview limitado" />
          <CompareItem title="Basic" text="Modal + histórico" />
          <CompareItem title="Pro" text="NBA + Futebol + Live" />
          <CompareItem title="Premium" text="Props por jogo" hot />
        </div>
        <div className="pricingGrid">
          {paidPlans.map(([key, plan]) => {
            const current = currentPlan === key;
            return (
              <article className={`pricingCard ${plan.popular ? 'popular' : ''} ${current ? 'current' : ''}`} key={key}>
                <div className="pricingCardHead">
                  {plan.popular ? <span className="popularTag">Mais usado</span> : <span className="popularTag muted">{planBadge(key)}</span>}
                  {current ? <span className="currentTag">Atual</span> : null}
                </div>
                <strong>{plan.name}</strong>
                <div className="planPrice">{plan.label}</div>
                <p>{plan.summary}</p>
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

function CompareItem({ title, text, hot = false }) {
  return (
    <div className={`pricingCompareItem ${hot ? 'hot' : ''}`}>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function planBadge(plan) {
  return {
    basic: 'Entrada',
    pro: 'Completo',
    premium: 'Avançado',
  }[plan] || 'Plano';
}
