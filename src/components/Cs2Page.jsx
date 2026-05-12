import { useMemo, useState } from 'react';

const MATCHES = [
  {
    id: 'cs2-1',
    league: 'IEM Dallas',
    stage: 'Upper bracket',
    start: 'Hoje 14:00',
    status: 'high',
    format: 'BO3',
    teamA: { name: 'NAVI', rank: 3, form: 'WWLWW', maps: ['Mirage', 'Nuke', 'Ancient'] },
    teamB: { name: 'Vitality', rank: 1, form: 'WLWWW', maps: ['Inferno', 'Dust2', 'Anubis'] },
    odds: { a: 2.08, b: 1.74 },
    score: 82,
    read: 'Vitality chega com melhor map pool e rating recente, mas NAVI tem valor se abrir Mirage.',
    picks: [
      { market: 'Vencedor', side: 'Vitality', edge: '+6.4', confidence: 78 },
      { market: 'Total mapas', side: 'Over 2.5', edge: '+3.1', confidence: 63 },
      { market: 'Mapa 1 rounds', side: 'Over 20.5', edge: '+4.2', confidence: 70 },
    ],
  },
  {
    id: 'cs2-2',
    league: 'ESL Pro League',
    stage: 'Group stage',
    start: 'Hoje 16:30',
    status: 'watch',
    format: 'BO3',
    teamA: { name: 'FaZe', rank: 5, form: 'LWWLW', maps: ['Ancient', 'Mirage', 'Inferno'] },
    teamB: { name: 'G2', rank: 6, form: 'WWLLW', maps: ['Nuke', 'Anubis', 'Dust2'] },
    odds: { a: 1.91, b: 1.88 },
    score: 68,
    read: 'Confronto equilibrado. Melhor leitura está em mapa/rounds, não no vencedor seco.',
    picks: [
      { market: 'Mapa 1 rounds', side: 'Over 21.5', edge: '+5.0', confidence: 74 },
      { market: 'Handicap', side: 'G2 +1.5', edge: '+2.7', confidence: 66 },
      { market: 'Pistol rounds', side: 'FaZe', edge: '+1.9', confidence: 58 },
    ],
  },
  {
    id: 'cs2-3',
    league: 'BLAST Premier',
    stage: 'Play-in',
    start: 'Amanhã 12:00',
    status: 'low',
    format: 'BO1',
    teamA: { name: 'MOUZ', rank: 2, form: 'WWWWW', maps: ['Nuke', 'Mirage', 'Vertigo'] },
    teamB: { name: 'Liquid', rank: 14, form: 'LWLLW', maps: ['Inferno', 'Ancient', 'Anubis'] },
    odds: { a: 1.42, b: 2.86 },
    score: 59,
    read: 'Favoritismo forte do MOUZ, mas preço baixo reduz o valor. Melhor esperar mercado de rounds.',
    picks: [
      { market: 'Vencedor', side: 'MOUZ', edge: '+1.5', confidence: 60 },
      { market: 'Handicap rounds', side: 'Liquid +4.5', edge: '+2.2', confidence: 57 },
      { market: 'Total rounds', side: 'Under 21.5', edge: '+0.8', confidence: 52 },
    ],
  },
  {
    id: 'cs2-4',
    league: 'CCT Global',
    stage: 'Quarterfinal',
    start: 'Amanhã 15:00',
    status: 'high',
    format: 'BO3',
    teamA: { name: 'Aurora', rank: 18, form: 'WWWLW', maps: ['Anubis', 'Ancient', 'Dust2'] },
    teamB: { name: 'BIG', rank: 24, form: 'LWLWW', maps: ['Nuke', 'Vertigo', 'Mirage'] },
    odds: { a: 1.77, b: 2.02 },
    score: 75,
    read: 'Aurora tem sequência melhor e veto favorável. BIG depende muito do primeiro mapa.',
    picks: [
      { market: 'Vencedor', side: 'Aurora', edge: '+4.8', confidence: 73 },
      { market: 'Mapa 1', side: 'Aurora', edge: '+3.6', confidence: 68 },
      { market: 'Total mapas', side: 'Over 2.5', edge: '+2.5', confidence: 61 },
    ],
  },
];

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'high', label: 'Forte' },
  { key: 'watch', label: 'Observar' },
  { key: 'today', label: 'Hoje' },
];

export function Cs2Page() {
  const [filter, setFilter] = useState('all');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const matches = useMemo(() => filterMatches(MATCHES, filter), [filter]);
  const top = MATCHES.slice().sort((a, b) => b.score - a.score)[0];

  return (
    <section className="cs2Page">
      <div className="cs2Hero panel">
        <div>
          <span>CS2 Radar</span>
          <strong>Confrontos e Map Pool</strong>
          <em>Leitura de partidas, odds, forma recente e mercados por mapa.</em>
        </div>
        <div className="cs2HeroStats">
          <Cs2Metric label="Jogos" value={MATCHES.length} />
          <Cs2Metric label="Forte" value={MATCHES.filter((match) => match.status === 'high').length} hot />
          <Cs2Metric label="Top SC" value={top?.score || '-'} />
        </div>
      </div>

      <nav className="cs2Filters">
        {FILTERS.map((item) => (
          <button
            className={filter === item.key ? 'active' : ''}
            type="button"
            key={item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="cs2Grid">
        {matches.map((match) => (
          <Cs2MatchCard match={match} key={match.id} onOpen={() => setSelectedMatch(match)} />
        ))}
      </div>

      {selectedMatch ? <Cs2MatchModal match={selectedMatch} onClose={() => setSelectedMatch(null)} /> : null}
    </section>
  );
}

function Cs2MatchCard({ match, onOpen }) {
  return (
    <button type="button" className={`cs2Card ${match.status}`} onClick={onOpen}>
      <div className="cs2CardTop">
        <span>{match.league}</span>
        <em>{match.format} · {match.start}</em>
      </div>
      <div className="cs2Matchup">
        <Cs2Team team={match.teamA} />
        <div className="cs2Vs">
          <strong>{match.score}</strong>
          <span>SC</span>
        </div>
        <Cs2Team team={match.teamB} align="right" />
      </div>
      <div className="cs2Odds">
        <span>{match.teamA.name} <b>{match.odds.a}</b></span>
        <span>{match.teamB.name} <b>{match.odds.b}</b></span>
      </div>
      <p>{match.read}</p>
      <div className="cs2PickStrip">
        {match.picks.slice(0, 2).map((pick) => (
          <span key={`${match.id}-${pick.market}`}>{pick.market}: <b>{pick.side}</b></span>
        ))}
      </div>
    </button>
  );
}

function Cs2MatchModal({ match, onClose }) {
  return (
    <div className="cs2ModalOverlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <section className="cs2Modal" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="pp-modal-close" onClick={onClose}>x</button>
        <div className="cs2ModalHero">
          <span>{match.league} · {match.stage}</span>
          <strong>{match.teamA.name} x {match.teamB.name}</strong>
          <em>{match.format} · {match.start}</em>
        </div>

        <div className="cs2ModalScore">
          <div>
            <span>Leitura StatCast</span>
            <p>{match.read}</p>
          </div>
          <strong>{match.score}</strong>
        </div>

        <div className="cs2TeamCompare">
          <Cs2TeamPanel team={match.teamA} odds={match.odds.a} />
          <Cs2TeamPanel team={match.teamB} odds={match.odds.b} />
        </div>

        <div className="cs2SectionTitle">Mercados monitorados</div>
        <div className="cs2PickList">
          {match.picks.map((pick) => (
            <div className="cs2PickRow" key={`${match.id}-${pick.market}`}>
              <span>{pick.market}</span>
              <strong>{pick.side}</strong>
              <em>{pick.edge} edge</em>
              <b>{pick.confidence}%</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Cs2TeamPanel({ team, odds }) {
  return (
    <div className="cs2TeamPanel">
      <div>
        <span>#{team.rank}</span>
        <strong>{team.name}</strong>
        <em>Odd {odds}</em>
      </div>
      <div className="cs2Form">
        {team.form.split('').map((letter, index) => (
          <i className={letter === 'W' ? 'win' : 'loss'} key={`${team.name}-${index}`}>{letter}</i>
        ))}
      </div>
      <div className="cs2Maps">
        {team.maps.map((map) => <b key={map}>{map}</b>)}
      </div>
    </div>
  );
}

function Cs2Team({ team, align = 'left' }) {
  return (
    <div className={`cs2Team ${align}`}>
      <span>#{team.rank}</span>
      <strong>{team.name}</strong>
      <em>{team.form}</em>
    </div>
  );
}

function Cs2Metric({ label, value, hot = false }) {
  return (
    <div className={`cs2Metric ${hot ? 'hot' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function filterMatches(matches, filter) {
  if (filter === 'all') return matches;
  if (filter === 'today') return matches.filter((match) => match.start.toLowerCase().includes('hoje'));
  return matches.filter((match) => match.status === filter);
}
