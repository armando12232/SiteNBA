export function requiredPageFeature(page, nbaTab = 'pregame') {
  if (page === 'nba-injuries' || (page === 'nba' && nbaTab === 'injuries')) return 'injuries';
  if (page === 'nba' && nbaTab === 'live') return 'live';
  if (page === 'football' || page === 'cs2') return page;
  if (['wnba', 'nfl', 'nhl', 'mlb'].includes(page)) return 'sports';
  return null;
}
