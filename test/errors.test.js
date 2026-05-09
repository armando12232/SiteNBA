import test from 'node:test';
import assert from 'node:assert/strict';
import { userErrorMessage } from '../src/utils/errors.js';

test('userErrorMessage maps common technical API failures', () => {
  assert.equal(userErrorMessage(new Error('HTTP 500')), 'Erro temporário ao carregar os dados. Tente atualizar.');
  assert.equal(userErrorMessage(new Error('HTTP 504 Gateway Timeout')), 'Os dados demoraram para responder. Tente novamente em alguns segundos.');
  assert.equal(userErrorMessage(new Error('fetch failed')), 'Falha de conexão. Tente atualizar.');
  assert.equal(userErrorMessage(new Error('HTTP 429')), 'Muitas tentativas em sequência. Aguarde um pouco e tente novamente.');
});

test('userErrorMessage preserves useful unknown messages and fallback', () => {
  assert.equal(userErrorMessage(new Error('Proxy inválido')), 'Proxy inválido');
  assert.equal(userErrorMessage(null, 'Fallback'), 'Fallback');
});
