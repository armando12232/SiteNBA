export function userErrorMessage(error, fallback = 'Não foi possível carregar os dados agora.') {
  const raw = String(error?.message || error || '').trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();

  if (lower.includes('failed to fetch') || lower.includes('fetch failed') || lower.includes('network')) {
    return 'Falha de conexão com a fonte de dados. Tente atualizar.';
  }
  if (lower.includes('http 401') || lower.includes('unauthorized')) {
    return 'A chave ou sessão não autorizou essa consulta.';
  }
  if (lower.includes('http 403') || lower.includes('forbidden')) {
    return 'A fonte recusou essa consulta para o plano/chave atual.';
  }
  if (lower.includes('http 404') || lower.includes('not found')) {
    return 'Nenhum dado encontrado para essa consulta.';
  }
  if (lower.includes('http 429') || lower.includes('rate')) {
    return 'Limite de requisições atingido. Aguarde um pouco e tente novamente.';
  }
  if (lower.includes('http 500') || lower.includes('internal server')) {
    return 'Erro temporário no servidor da fonte. Tente atualizar.';
  }
  if (lower.includes('http 502') || lower.includes('http 503') || lower.includes('http 504') || lower.includes('gateway')) {
    return 'A fonte demorou ou ficou indisponível. Tente novamente em alguns segundos.';
  }
  if (lower.includes('abort') || lower.includes('timeout') || lower.includes('timed out')) {
    return 'A fonte demorou para responder. Tente atualizar em alguns segundos.';
  }

  return raw.length > 140 ? `${raw.slice(0, 137)}...` : raw;
}
