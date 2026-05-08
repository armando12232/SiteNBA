import { fetchJson } from './http.js';
import { SUPABASE_CONFIGURED, SUPABASE_CONFIG_ERROR, supabase } from './supabase.js';

export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    label: 'R$0',
    summary: 'Para testar o radar antes de assinar.',
    features: ['Props principais', 'Acesso limitado', 'Dados com cache'],
  },
  basic: {
    name: 'Basic',
    price: 29,
    label: 'R$29/mês',
    summary: 'Para quem quer abrir modais e ver mais props NBA.',
    features: ['Mais jogadores NBA', 'Modal completo do jogador', 'Histórico recente', 'Leitura por linha e hit rate'],
  },
  pro: {
    name: 'Pro',
    price: 59,
    label: 'R$59/mês',
    popular: true,
    summary: 'Plano principal para usar NBA + futebol no dia a dia.',
    features: ['NBA completo', 'Live alerts', 'Futebol completo', 'Lesões NBA', 'NFL/NHL/MLB'],
  },
  premium: {
    name: 'Premium',
    price: 99,
    label: 'R$99/mês',
    summary: 'Para operação completa, prioridade e recursos avançados.',
    features: ['Tudo do Pro', 'Props por jogo do dia', 'Prioridade', 'Admin/relatórios', 'Novos módulos'],
  },
};

export const PLAN_ACCESS = {
  free: {
    maxProps: 8,
    modal: false,
    live: false,
    injuries: false,
    football: false,
    sports: false,
    propsByGame: false,
  },
  basic: {
    maxProps: 25,
    modal: true,
    live: false,
    injuries: false,
    football: false,
    sports: false,
    propsByGame: false,
  },
  pro: {
    maxProps: -1,
    modal: true,
    live: true,
    injuries: true,
    football: true,
    sports: true,
    propsByGame: false,
  },
  premium: {
    maxProps: -1,
    modal: true,
    live: true,
    injuries: true,
    football: true,
    sports: true,
    propsByGame: true,
  },
};

export function getPlanAccess(plan) {
  return PLAN_ACCESS[plan] || PLAN_ACCESS.free;
}

export async function getCurrentSession() {
  if (!SUPABASE_CONFIGURED) return null;
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export async function loadSubscription(userId) {
  if (!userId) return freeSubscription();
  const session = await getCurrentSession();
  if (!session?.access_token) return freeSubscription();
  const data = await loadSubscriptionDetails(session.access_token);
  return normalizeSubscription(data);
}

export async function loadSubscriptionDetails(accessToken) {
  if (!accessToken) throw new Error('missing access token');
  return fetchJson('/api/subscription', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }, 15000);
}

export async function signIn(email, password) {
  if (!SUPABASE_CONFIGURED) return authConfigError();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password) {
  if (!SUPABASE_CONFIGURED) return authConfigError();
  return supabase.auth.signUp({ email, password });
}

export async function signOut() {
  if (!SUPABASE_CONFIGURED) return { error: null };
  return supabase.auth.signOut({ scope: 'local' });
}

export async function startCheckout(plan) {
  if (!SUPABASE_CONFIGURED) throw new Error(SUPABASE_CONFIG_ERROR);
  const session = await getCurrentSession();
  if (!session?.access_token) throw new Error('Entre na conta antes de assinar.');
  return fetchJson('/api/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ plan }),
  }, 20000);
}

export function normalizeSubscription(row) {
  const plan = PLANS[row?.plan] ? row.plan : 'free';
  return {
    plan,
    status: row?.status || 'active',
    role: row?.role || 'user',
    label: PLANS[plan].name,
  };
}

export function freeSubscription() {
  return normalizeSubscription({ plan: 'free', status: 'active', role: 'guest' });
}

function authConfigError() {
  return { data: null, error: new Error(SUPABASE_CONFIG_ERROR) };
}
