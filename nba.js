export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, gameId } = req.query;

  try {
    let url, data;

    if (type === 'scoreboard') {
      url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      data = await r.json();
      res.setHeader('Cache-Control', 's-maxage=30');
      return res.status(200).json(data);
    }

    if (type === 'boxscore' && gameId) {
      url = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      data = await r.json();
      res.setHeader('Cache-Control', 's-maxage=30');
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'Invalid request' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch data', detail: err.message });
  }
}
