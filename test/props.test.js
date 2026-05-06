import test from 'node:test';
import assert from 'node:assert/strict';

import { confidenceFromEdge, ensureHalfLine, getBestProp } from '../src/utils/props.js';

test('ensureHalfLine keeps half lines and rounds integer lines up to .5', () => {
  assert.equal(ensureHalfLine(21.5), 21.5);
  assert.equal(ensureHalfLine(21), 21.5);
  assert.equal(ensureHalfLine('18'), 18.5);
});

test('confidenceFromEdge maps thresholds correctly', () => {
  assert.deepEqual(confidenceFromEdge(5), { text: 'Alta', className: 'high' });
  assert.deepEqual(confidenceFromEdge(3), { text: 'Média', className: 'medium' });
  assert.deepEqual(confidenceFromEdge(1), { text: 'Baixa', className: 'low' });
});

test('getBestProp selects the prop with the highest edge among valid lines', () => {
  const result = getBestProp({
    props: {
      pts: { line: 26.5, edge: 1.5 },
      reb: { line: 8.5, edge: 3.5 },
      ast: { line: null, edge: 9.9 },
    },
  });

  assert.equal(result.stat, 'reb');
  assert.equal(result.line, 8.5);
  assert.equal(result.edge, 3.5);
});
