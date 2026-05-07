import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFootballHighlights,
  buildFootballRead,
  buildFootballSummary,
  buildLeagueSummary,
  decimalOdd,
  findTeamStats,
  filterByFootballStatus,
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

test('buildFootballRead raises score when live stats, market and pregame data exist', () => {
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

  assert.equal(read.tier, 'elite');
  assert.equal(read.title, 'Elite read');
  assert.equal(read.signals.find((item) => item.label === 'Pressao').value, 21);
  assert.equal(read.signals.find((item) => item.label === 'Arbitro').value, '4.8');
});

test('buildFootballHighlights returns the top five sorted by read strength', () => {
  const manyFixtures = Array.from({ length: 7 }, (_, index) => ({
    ...fixtures[index % fixtures.length],
    id: String(index + 1),
    date: `2026-05-06T1${index}:00:00Z`,
    live: index === 4,
  }));

  const highlights = buildFootballHighlights(manyFixtures);

  assert.equal(highlights.length, 5);
  assert.equal(highlights[0].fixture.id, '5');
});
