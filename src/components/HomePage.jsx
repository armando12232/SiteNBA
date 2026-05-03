import { PREGAME_PLAYERS } from '../data/pregamePlayers.js';

const MODULES = [
  { key: 'nba', title: 'Player Props', text: 'Hit rates L5-L20, linhas, edge e modal com historico real.', action: 'Abrir NBA', status: 'Core' },
  { key: 'football', title: 'Futebol', text: 'Jogos do dia, ao vivo, odds, estatisticas, pregame e leitura por score.', action: 'Abrir Futebol', status: 'Novo' },
  { key: 'nfl', title: 'NFL', text: 'Placar e agenda via ESPN para expandir depois.', action: 'Abrir NFL', status: 'Base' },
  { key: 'nhl', title: 'NHL', text: 'Hockey ao vivo, placares e calendario.', action: 'Abrir NHL', status: 'Base' },
  { key: 'mlb', title: 'MLB', text: 'Baseball, scores do dia e classificacao.', action: 'Abrir MLB', status: 'Base' },
  { key: 'injuries', title: 'Lesoes NBA', text: 'Jogadores fora, questionaveis e provaveis.', action: 'Ver lesoes', status: 'NBA' },
];

const QUICK_ACTIONS = [
  { label: 'NBA Props', target: 'nba', text: 'Radar de props pre-game' },
  { label: 'NBA Lesoes', target: 'nba-injuries', text: 'Disponibilidade dos jogadores' },
  { label: 'Futebol', target: 'football', text: 'Jogos, odds e score' },
  { label: 'NFL', target: 'nfl', text: 'Placar ESPN' },
];

export function HomePage({ onNavigate }) {
  return (
    <section className="homePage">
      <div className="homeHero panel">
        <div>
          <div className="eyebrow visible">StatCast BR</div>
          <h1>Central de Dados</h1>
          <p>Escolha um modulo para acompanhar props, placares, lesoes e jogos ao vivo em um painel unico.</p>
        </div>
        <div className="homeStatusGrid">
          <HomeStat label="Props NBA" value={PREGAME_PLAYERS.length} />
          <HomeStat label="Modulos" value={MODULES.length} />
          <HomeStat label="Esportes" value="5" />
        </div>
      </div>

      <section className="quickActions">
        <div>
          <span>Atalhos</span>
          <strong>Ir direto para o que importa</strong>
        </div>
        <div className="quickActionGrid">
          {QUICK_ACTIONS.map((item) => (
            <button key={item.label} type="button" onClick={() => onNavigate(item.target)}>
              <strong>{item.label}</strong>
              <em>{item.text}</em>
            </button>
          ))}
        </div>
      </section>
      <div className="moduleGrid">
        {MODULES.map((item) => (
          <button
            className="moduleCard"
            key={item.key}
            type="button"
            onClick={() => onNavigate(item.key === 'injuries' ? 'nba-injuries' : item.key)}
          >
            <small>{item.status}</small>
            <strong>{item.title}</strong>
            <span>{item.text}</span>
            <em>{item.action}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function HomeStat({ label, value }) {
  return (
    <div className="homeStat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
