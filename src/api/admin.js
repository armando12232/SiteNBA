export async function getAdminSummary(accessToken) {
  return adminFetch('/api/admin?type=summary', { accessToken });
}

export async function getAdminMe(accessToken) {
  return adminFetch('/api/admin?type=me', { accessToken });
}

export async function getAdminHealth() {
  return adminFetch('/api/admin?type=health');
}

export async function updateAdminPlan(accessToken, userId, plan) {
  return adminFetch('/api/admin', {
    accessToken,
    method: 'POST',
    body: { action: 'update_plan', user_id: userId, plan },
  });
}

export async function updateAdminUser(accessToken, userId, data) {
  return adminFetch('/api/admin', {
    accessToken,
    method: 'POST',
    body: { action: 'update_user', user_id: userId, ...data },
  });
}

async function adminFetch(url, { accessToken, method = 'GET', body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
