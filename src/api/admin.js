export async function getAdminSummary(accessToken) {
  return adminFetch('/api/admin?type=summary', { accessToken });
}

export async function updateAdminPlan(accessToken, userId, plan) {
  return adminFetch('/api/admin', {
    accessToken,
    method: 'POST',
    body: { action: 'update_plan', user_id: userId, plan },
  });
}

async function adminFetch(url, { accessToken, method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
