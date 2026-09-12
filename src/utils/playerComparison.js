import { numberOrNull } from './props.js';

export function comparisonValue(player, stat) {
  return numberOrNull(player?.last5_avg?.[stat]) ?? numberOrNull(player?.season_avg?.[stat]);
}

export function comparisonWinner(left, right, stat) {
  const leftValue = comparisonValue(left, stat);
  const rightValue = comparisonValue(right, stat);
  if (leftValue == null || rightValue == null || leftValue === rightValue) return null;
  return leftValue > rightValue ? 'left' : 'right';
}

