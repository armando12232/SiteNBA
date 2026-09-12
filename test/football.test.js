import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFootballHighlights,
  buildFootballRead,
  buildFootballSummary,
  buildLeagueSummary,
  decimalOdd,
  findTeamStats,
  filterFootballFixtures,
  filterByFootballStatus,
  footballFilterHasConstraints,
  footballStatusLabel,
  formatFootballOdd,
  formatFootballStat,
  normalizeFootballSearch,
  parseFootballStat,
  sortFootballFixtures,
} from '../src/utils/football.js';

const fixtures = [
  {
    id: '1',
    home: 'Flamengo',
    away: 'Palmeiras',
    league_key: 'brasileirao',
    league_name: 'Brasileirao',
    date: '2026-05-06T21:00:00Z',
    live: false,
    finished: false,
  },
  {
    id: '2',
    home: 'Arsenal',
    away: 'Chelsea',
    league_key: 'premier',
    league_name: 'Premier',
    date: '2026-05-06T19:00:00Z',
    live: true,
    finished: false,
  },
  {
    id: '3',
    home: 'Milan',
    away: 'Inter',
    league_key: 'seriea',
    league_name: 'Serie A',
    date: '2026-05-05T19:00:00Z',
    live: false,
    finished: true,
  },
];

test('filterByFootballStatus separates live, upcoming and finished fixtures', () => {
  assert.deepEqual(filterByFootballStatus(fixtures, 'live').map((item) => item.id), ['2']);
  assert.deepEqual(filterByFootballStatus(fixtures, 'upcoming').map((item) => item.id), ['1']);
  assert.deepEqual(filterByFootballStatus(fixtures, 'finished').map((item) => item.id), ['3']);
  assert.equal(filterByFootballStatus(fixtures, 'all').length, 3);
});

test('filterFootballFixtures applies tab, league, status and accent-insensitive search', () => {
  const result = filterFootballFixtures(
    [
      ...fixtures,
      { ...fixtures[0], id: '4', home: 'Sao Paulo', away: 'Botafogo', league_key: 'brasileirao' },
    ],
    { activeTab: 'fixtures', league: 'brasileirao', query: 'são', statusFilter: 'upcoming' },
  );

  assert.deepEqual(result.map((item) => item.id), ['4']);
});

test('footballFilterHasConstraints and footballStatusLabel expose UI state safely', () => {
  assert.equal(footballFilterHasConstraints({ league: 'all', query: '', statusFilter: 'all' }), false);
  assert.equal(footballFilterHasConstraints({ league: 'premier', query: '', statusFilter: 'all' }), true);
  assert.equal(footballStatusLabel({ live: true, elapsed: '32:10' }), 'Ao vivo 32:10');
  assert.equal(footballStatusLabel({ finished: true }), 'Encerrado');
  assert.equal(footballStatusLabel({ status_long: 'Agendado' }), 'Agendado');
});

test('normalizeFootballSearch removes accents and trims text for matching', () => {
  assert.equal(normalizeFootballSearch('  São Paulo  '), 'sao paulo');
});

test('buildFootballSummary counts status and picks live fixture as featured', () => {
  const summary = buildFootballSummary(fixtures);

  assert.equal(summary.total, 3);
  assert.equal(summary.live, 1);
  assert.equal(summary.upcoming, 1);
  assert.equal(summary.leagues, 3);
  assert.equal(summary.featured.id, '2');
});

test('sortFootballFixtures prioritizes live games for time sorting', () => {
  assert.deepEqual(sortFootballFixtures(fixtures, 'time').map((item) => item.id), ['2', '3', '1']);
});

test('buildLeagueSummary orders leagues by live count then total fixtures', () => {
  const summary = buildLeagueSummary([
    ...fixtures,
    { ...fixtures[0], id: '4', live: false, finished: false },
  ]);

  assert.equal(summary[0].key, 'premier');
  assert.equal(summary.find((item) => item.key === 'brasileirao').total, 2);
});

test('parseFootballStat and decimalOdd normalize external API values', () => {
  assert.equal(parseFootballStat('55%'), 55);
  assert.equal(parseFootballStat('7,5'), 7.5);
  assert.equal(parseFootballStat('n/a'), 0);
  assert.equal(decimalOdd('+150'), 2.5);
  assert.equal(Number(decimalOdd('-200').toFixed(2)), 1.5);
  assert.equal(decimalOdd('1,85'), 1.85);
});

test('findTeamStats matches exact and contained ESPN team names', () => {
  const teams = [
    { team: 'Arsenal', stats: { totalShots: '12' } },
    { team: 'Chelsea', stats: { totalShots: '9' } },
  ];

  assert.equal(findTeamStats(teams, 'Arsenal')?.team, 'Arsenal');
  assert.equal(findTeamStats(teams, 'Arsenal FC')?.team, 'Arsenal');
  assert.equal(findTeamStats(teams, 'Chelsea')?.stats.totalShots, '9');
});

test('buildFootballRead reports facts without manufacturing a betting score', () => {
  const read = buildFootballRead(fixtures[1], {
    stats: {
      teams: [
        { team: 'Arsenal', stats: { totalShots: '12', shotsOnTarget: '6' } },
        { team: 'Chelsea', stats: { totalShots: '9', shotsOnTarget: '4' } },
      ],
    },
    odds: { over25: '1.70', bttsYes: '1.80' },
    pregame: {
      teams: [
        { team: 'Arsenal', record: 'W-W-D' },
        { team: 'Chelsea', points: 64 },
      ],
    },
    referee: { referee_stats: { avg_cards: '4.8' } },
  });

  assert.equal(read.score, null);
  assert.equal(read.title, 'Resumo ao vivo');
  assert.equal(read.signals.find((item) => item.label === 'Chutes').value, 21);
  assert.equal(read.signals.find((item) => item.label === 'Árbitro').value, '4.8');
});

test('buildFootballHighlights puts live and upcoming games before finished games', () => {
  const manyFixtures = Array.from({ length: 7 }, (_, index) => ({
    ...fixtures[index % fixtures.length],
    id: String(index + 1),
    date: `2026-05-06T1${index}:00:00Z`,
    live: index === 4,
  }));

  const highlights = buildFootballHighlights(manyFixtures);

  assert.equal(highlights.length, 5);
  assert.equal(highlights[0].fixture.id, '5');
  assert.equal(highlights.some(({ fixture }) => fixture.finished), false);
  assert.deepEqual(buildFootballHighlights([fixtures[2]]), []);
});

test('all-games tab includes live games and live filter remains usable', () => {
  assert.equal(filterFootballFixtures(fixtures).length, 3);
  assert.deepEqual(filterFootballFixtures(fixtures, { statusFilter: 'live' }).map((item) => item.id), ['2']);
  assert.deepEqual(filterFootballFixtures(fixtures, { activeTab: 'live' }).map((item) => item.id), ['2']);
});

test('missing match data does not become a score or zero-shot statistic', () => {
  const read = buildFootballRead(fixtures[0]);
  assert.equal(read.score, null);
  assert.equal(read.title, 'Sem dados suficientes');
  assert.equal(read.signals.find((item) => item.label === 'Chutes').value, '-');
});

test('a goal total is a market line, never a decimal over-2.5 odd', () => {
  const read = buildFootballRead(fixtures[0], { pregame: { odds: { overUnder: 2.5 } } });
  assert.equal(read.signals.find((item) => item.label === 'Over 2.5'), undefined);
  assert.equal(read.signals.find((item) => item.label === 'Linha de gols').value, 2.5);
});

test('finished matches have a historical summary even with large attacking totals', () => {
  const read = buildFootballRead(fixtures[2], { stats: { teams: [
    { team: 'Milan', stats: { totalShots: 28, shotsOnTarget: 12 } },
    { team: 'Inter', stats: { totalShots: 25, shotsOnTarget: 11 } },
  ] } });
  assert.equal(read.score, null);
  assert.equal(read.title, 'Resumo final');
  assert.match(read.summary, /encerrada/);
});

test('football percentages distinguish ratios, percentage points, zero and missing values', () => {
  assert.equal(formatFootballStat('0.8', 'passPct'), '80%');
  assert.equal(formatFootballStat('82.4', 'passPct'), '82.4%');
  assert.equal(formatFootballStat('0.8%', 'passPct'), '0.8%');
  assert.equal(formatFootballStat(0, 'passPct'), '0%');
  assert.equal(formatFootballStat(undefined, 'passPct'), '-');
  assert.equal(formatFootballStat(0, 'redCards'), '0');
});

test('football odds respect provider formats including long decimal prices', () => {
  assert.equal(formatFootballOdd(15, 'decimal'), '15.00');
  assert.equal(formatFootballOdd(-200, 'american'), '1.50');
  assert.equal(formatFootballOdd(150, 'american'), '2.50');
  assert.equal(formatFootballOdd('1,85', 'decimal'), '1.85');
  assert.equal(formatFootballOdd(null), '-');
});
