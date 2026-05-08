import test from 'node:test';
import assert from 'node:assert/strict';
import { userErrorMessage } from '../src/utils/errors.js';

test('userErrorMessage maps common technical API failures', () => {
  assert.equal(userErrorMessage(new Error('HTTP 500')), 'Erro temporário no servidor da fonte. Tente atualizar.');
  assert.equal(userErrorMessage(new Error('HTTP 504 Gateway Timeout')), 'A fonte demorou ou ficou indisponível. Tente novamente em alguns segundos.');
  assert.equal(userErrorMessage(new Error('fetch failed')), 'Falha de conexão com a fonte de dados. Tente atualizar.');
  assert.equal(userErrorMessage(new Error('HTTP 429')), 'Limite de requisições atingido. Aguarde um pouco e tente novamente.');
});

test('userErrorMessage preserves useful unknown messages and fallback', () => {
  assert.equal(userErrorMessage(new Error('Proxy inválido')), 'Proxy inválido');
  assert.equal(userErrorMessage(null, 'Fallback'), 'Fallback');
});
