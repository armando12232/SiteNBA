import { fetchJson } from './http.js';
import { supabase } from './supabase.js';

export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    label: 'R$0',
    features: ['Props principais', 'Acesso limitado', 'Dados com cache'],
  },
  basic: {
    name: 'Basic',
    price: 29,
    label: 'R$29/mês',
    features: ['Mais jogadores', 'Histórico recente', 'Futebol básico'],
  },
  pro: {
    name: 'Pro',
    price: 59,
    label: 'R$59/mês',
    popular: true,
    features: ['NBA completo', 'Live alerts', 'Futebol completo', 'Lesões'],
  },
  premium: {
    name: 'Premium',
    price: 99,
    label: 'R$99/mês',
    features: ['Tudo do Pro', 'Prioridade', 'Admin/relatórios', 'Novos módulos'],
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
  },
  basic: {
    maxProps: 25,
    modal: true,
    live: false,
    injuries: false,
    football: false,
    sports: false,
  },
  pro: {
    maxProps: -1,
    modal: true,
    live: true,
    injuries: true,
    football: true,
    sports: true,
  },
  premium: {
    maxProps: -1,
    modal: true,
    live: true,
    injuries: true,
    football: true,
    sports: true,
  },
};

export function getPlanAccess(plan) {
  return PLAN_ACCESS[plan] || PLAN_ACCESS.free;
}

export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export async function loadSubscription(userId) {
  if (!userId) return freeSubscription();
  const session = await getCurrentSession();
  if (!session?.access_token) return freeSubscription();
  const data = await fetchJson('/api/subscription', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  }, 15000);
  return normalizeSubscription(data);
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut({ scope: 'local' });
}

export async function startCheckout(plan) {
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
