export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, gameId, athleteId } = req.query;

  try {
    let url;

    if (type === 'scoreboard') {
      url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
    } else if (type === 'boxscore' && gameId) {
      url = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
    } else if (type === 'athlete_stats' && athleteId) {
      url = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${athleteId}/stats`;
    } else {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Origin': 'https://www.espn.com',
        'Referer': 'https://www.espn.com/'
      }
    });

    if (!r.ok) return res.status(r.status).json({ error: `ESPN returned ${r.status}` });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch data', detail: err.message });
  }
}
