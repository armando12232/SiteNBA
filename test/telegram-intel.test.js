import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTelegramIntel,
  parseTelegramUpdate,
  scoreIntelMatch,
} from '../api/_telegramIntel.js';

const sample = `
DADOS DISCIPLINARES

Aqui vai um resumo das estatisticas relevantes para cartoes.

Arbitro: Joao Pedro Silva Pinheiro
Media UCL: 4,00 | Liga PT: 5,31
Ultimos 5: 8-2-6-4-5

Bayern (Bundesliga / UCL)
3-2-2-3-1 | 0-1-4-0-3

PSG (Ligue 1 / UCL)
1-2-5-0 | 3-0-0-1
`;

test('parseTelegramIntel extracts discipline data from VIP group message text', () => {
  const intel = parseTelegramIntel(sample, {
    chat_id: '-100123',
    message_id: '77',
    message_date: '2026-05-06T12:00:00.000Z',
  });

  assert.equal(intel.type, 'discipline');
  assert.equal(intel.chat_id, '-100123');
  assert.equal(intel.message_id, '77');
  assert.equal(intel.referee, 'Joao Pedro Silva Pinheiro');
  assert.equal(intel.avg_ucl_cards, 4);
  assert.equal(intel.avg_league_cards, 5.31);
  assert.deepEqual(intel.ref_last, [8, 2, 6, 4, 5]);
  assert.equal(intel.teams.length, 2);
  assert.equal(intel.teams[0].name, 'Bayern');
  assert.deepEqual(intel.teams[1].cards_last, [1, 2, 5, 0]);
});

test('parseTelegramUpdate reads message caption and metadata', () => {
  const intel = parseTelegramUpdate({
    message: {
      message_id: 10,
      date: 1778000000,
      chat: { id: -100123 },
      caption: sample,
    },
  });

  assert.equal(intel.chat_id, '-100123');
  assert.equal(intel.message_id, '10');
  assert.equal(intel.home_team, 'Bayern');
  assert.equal(intel.away_team, 'PSG');
});

test('scoreIntelMatch ranks intel that mentions fixture teams', () => {
  const intel = parseTelegramIntel(sample);

  assert.equal(scoreIntelMatch(intel, { home: 'Bayern Munich', away: 'Paris Saint-Germain' }), 1);
  assert.equal(scoreIntelMatch(intel, { home: 'Bayern', away: 'PSG' }), 2);
  assert.equal(scoreIntelMatch(intel, { home: 'Arsenal', away: 'Chelsea' }), 0);
});
