import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  PLANS,
  createSubscriptionSync,
  freeSubscription,
  getCurrentSession,
  isSubscriptionActive,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  startCheckout,
  updatePassword,
} from '../api/subscriptions.js';
import { SUPABASE_CONFIGURED, supabase } from '../api/supabase.js';
import { userErrorMessage } from '../utils/errors.js';

export function SubscriptionWidget({ onSubscriptionChange }) {
  const [{ session, subscription, loading, error }, setAccount] = useState({
    session: null, subscription: freeSubscription(), loading: true, error: null,
  });
  const [modal, setModal] = useState(null);
  const syncRef = useRef(null);

  useEffect(() => {
    let alive = true;
    let receivedAuthEvent = false;
    const sync = createSubscriptionSync((account) => { if (alive) setAccount(account); });
    syncRef.current = sync;
    if (!SUPABASE_CONFIGURED) {
      void sync.refresh(null);
      return () => {
        alive = false;
        sync.stop();
        syncRef.current = null;
      };
    }
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      receivedAuthEvent = true;
      if (event === 'PASSWORD_RECOVERY') setModal('recovery');
      void sync.refresh(nextSession);
    });
    getCurrentSession().then((nextSession) => {
      if (alive && !receivedAuthEvent) void sync.refresh(nextSession);
    }).catch(() => {
      if (alive && !receivedAuthEvent) void sync.refresh(null);
    });
    return () => {
      alive = false;
      sync.stop();
      syncRef.current = null;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function openPricing() {
      setModal('pricing');
    }
    function openAuth() {
      setModal('auth');
    }
    window.addEventListener('statcast:open-pricing', openPricing);
    window.addEventListener('statcast:open-auth', openAuth);
    return () => {
      window.removeEventListener('statcast:open-pricing', openPricing);
      window.removeEventListener('statcast:open-auth', openAuth);
    };
  }, []);

  useEffect(() => {
    onSubscriptionChange?.({ session, subscription });
  }, [onSubscriptionChange, session, subscription]);

  const plan = PLANS[subscription.plan] || PLANS.free;
  const active = isSubscriptionActive(subscription);

  return (
    <div className="subWidget">
      <button type="button" className={`planBadge plan-${subscription.plan}`} onClick={() => setModal('pricing')}>
        {loading ? 'Plano' : `${plan.name}${active ? '' : ' (inativo)'}`}
      </button>
      {error ? <button type="button" className="subBtn ghost" onClick={() => syncRef.current?.refresh(session)} title="Não foi possível atualizar sua assinatura. Tente novamente.">Recarregar plano</button> : null}
      {session ? (
        <>
          <span className="subEmail">{session.user?.email}</span>
          <button type="button" className="subBtn ghost" onClick={() => signOut()}>Sair</button>
        </>
      ) : (
        <button type="button" className="subBtn" onClick={() => setModal('auth')}>Entrar</button>
      )}
      {modal === 'auth' ? <AuthModal onClose={() => setModal(null)} /> : null}
      {modal === 'recovery' ? <RecoveryModal onClose={() => setModal(null)} /> : null}
      {modal === 'pricing' ? (
        <PricingModal
          currentPlan={active ? subscription.plan : 'free'}
          hasSession={Boolean(session)}
          onNeedAuth={() => setModal('auth')}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

function AuthModal({ onClose }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const dialogRef = useModalKeyboard(onClose);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'reset') {
        const { error } = await requestPasswordReset(email.trim());
        if (error) throw error;
        setMessage('Enviamos o link para redefinir sua senha. Confira também a caixa de spam.');
        return;
      }
      const action = mode === 'login' ? signIn : signUp;
      const { error } = await action(email.trim(), password);
      if (error) throw error;
      setMessage(mode === 'login' ? 'Login feito.' : 'Conta criada. Confirme o e-mail se solicitado.');
      if (mode === 'login') setTimeout(onClose, 500);
    } catch (error) {
      const fallback = mode === 'login'
        ? 'Não foi possível entrar agora.'
        : mode === 'signup'
          ? 'Não foi possível criar a conta agora.'
          : 'Não foi possível enviar o link agora.';
      setMessage(userErrorMessage(error, fallback));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="subOverlay" onMouseDown={onClose}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="subModal auth" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Fechar" className="subClose" onClick={onClose}>x</button>
        <div className="subKicker">Conta</div>
        <h3 id={titleId}>{mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Recuperar senha'}</h3>
        <form className="authForm" onSubmit={submit}>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="email" aria-label="E-mail" autoComplete="email" required />
          {mode !== 'reset' ? <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="senha" aria-label="Senha" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required /> : null}
          {message ? <div className="authMessage">{message}</div> : null}
          <button type="submit" disabled={busy}>{busy ? 'Aguarde...' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}</button>
        </form>
        <div className="authLinks">
          {mode === 'login' ? <button type="button" className="linkBtn" disabled={busy} onClick={() => { setMode('reset'); setMessage(''); }}>Esqueci minha senha</button> : null}
          <button type="button" className="linkBtn" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}>
            {mode === 'login' ? 'Criar conta nova' : 'Voltar para entrar'}
          </button>
        </div>
      </section>
    </div>
  );
}

function RecoveryModal({ onClose }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const dialogRef = useModalKeyboard(onClose);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmation) {
      setMessage('As senhas precisam ser iguais.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { error } = await updatePassword(password);
      if (error) throw error;
      setMessage('Senha atualizada com sucesso.');
      setTimeout(onClose, 800);
    } catch (error) {
      setMessage(userErrorMessage(error, 'Não foi possível atualizar sua senha agora.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="subOverlay" onMouseDown={onClose}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="subModal auth" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Fechar" className="subClose" onClick={onClose}>x</button>
        <div className="subKicker">Conta</div>
        <h3 id={titleId}>Nova senha</h3>
        <form className="authForm" onSubmit={submit}>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="nova senha" aria-label="Nova senha" autoComplete="new-password" minLength={6} required />
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} type="password" placeholder="confirme a senha" aria-label="Confirmar nova senha" autoComplete="new-password" minLength={6} required />
          {message ? <div className="authMessage">{message}</div> : null}
          <button type="submit" disabled={busy}>{busy ? 'Aguarde...' : 'Salvar nova senha'}</button>
        </form>
      </section>
    </div>
  );
}

function PricingModal({ currentPlan, hasSession, onNeedAuth, onClose }) {
  const [busyPlan, setBusyPlan] = useState('');
  const [error, setError] = useState('');
  const paidPlans = useMemo(() => Object.entries(PLANS).filter(([key]) => key !== 'free'), []);
  const titleId = useId();
  const dialogRef = useModalKeyboard(onClose);

  async function selectPlan(plan) {
    if (busyPlan) return;
    setError('');
    if (!hasSession) {
      onNeedAuth();
      return;
    }
    setBusyPlan(plan);
    try {
      const data = await startCheckout(plan);
      if (!data?.url) throw new Error('Não foi possível abrir o checkout agora.');
      window.location.href = data.url;
    } catch (error) {
      setError(userErrorMessage(error, 'Não foi possível abrir o checkout agora.'));
      setBusyPlan('');
    }
  }

  return (
    <div className="subOverlay" onMouseDown={onClose}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="subModal pricing" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Fechar" className="subClose" onClick={onClose}>x</button>
        <div className="subKicker">Assinaturas</div>
        <h3 id={titleId}>Escolha seu plano</h3>
        <p className="pricingLead">Free mostra uma amostra. Basic libera estudo NBA. Pro libera NBA, futebol, CS2 e esportes extras. Premium adiciona leitura por confronto.</p>
        {error ? <div className="authMessage pricingError">{error}</div> : null}
        <div className="pricingCompare">
          <CompareItem title="Free" text="Preview limitado" />
          <CompareItem title="Basic" text="Modal + histórico" />
          <CompareItem title="Pro" text="NBA + Futebol + CS2" />
          <CompareItem title="Premium" text="Melhores Props" hot />
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
                <button type="button" disabled={current || Boolean(busyPlan)} onClick={() => selectPlan(key)}>
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

function useModalKeyboard(onClose) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.querySelector('button, input')?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current?.();
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog?.addEventListener('keydown', handleKey);
    return () => {
      dialog?.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, []);

  return dialogRef;
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

