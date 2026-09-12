import { PREGAME_PLAYERS } from '../data/pregamePlayers.js';

const MODULES = [
  { key: 'wnba', icon: 'WN', title: 'WNBA', text: 'Placar, agenda e jogos ao vivo da liga feminina.', action: 'Abrir WNBA', status: 'Novo' },
  { key: 'nba', icon: 'PP', title: 'Player Props', text: 'Hit rates L5-L20, linhas, edge e modal com histórico real.', action: 'Abrir NBA', status: 'Core' },
  { key: 'football', icon: 'FT', title: 'Futebol', text: 'Jogos do dia, ao vivo, odds, estatísticas e contexto da partida.', action: 'Abrir Futebol', status: 'Novo' },
  { key: 'cs2', icon: 'C2', title: 'CS2', text: 'Radar de confrontos, mapas, forma recente e leitura por score.', action: 'Abrir CS2', status: 'Novo' },
  { key: 'nfl', icon: 'NFL', title: 'NFL', text: 'Placar e agenda para acompanhar os próximos jogos.', action: 'Abrir NFL', status: 'Base' },
  { key: 'nhl', icon: 'NHL', title: 'NHL', text: 'Hockey ao vivo, placares e calendário.', action: 'Abrir NHL', status: 'Base' },
  { key: 'mlb', icon: 'MLB', title: 'MLB', text: 'Baseball, jogos do dia e classificação.', action: 'Abrir MLB', status: 'Base' },
  { key: 'injuries', icon: 'IN', title: 'Lesões NBA', text: 'Jogadores fora, questionáveis e prováveis.', action: 'Ver lesões', status: 'NBA' },
];

const QUICK_ACTIONS = [
  { icon: 'WN', label: 'WNBA', target: 'wnba', text: 'Jogos e placares' },
  { icon: 'PP', label: 'NBA Props', target: 'nba', text: 'Radar de props pré-jogo' },
  { icon: 'IN', label: 'NBA Lesões', target: 'nba-injuries', text: 'Disponibilidade dos jogadores' },
  { icon: 'FT', label: 'Futebol', target: 'football', text: 'Jogos, odds e estatísticas' },
  { icon: 'C2', label: 'CS2', target: 'cs2', text: 'Confrontos e mapas' },
  { icon: 'NFL', label: 'NFL', target: 'nfl', text: 'Placar e agenda' },
];

export function HomePage({ onNavigate }) {
  return (
    <section className="homePage">
      <div className="homeHero panel">
        <div>
          <div className="eyebrow visible">StatCast BR</div>
          <h1>Central de Dados</h1>
          <p>Escolha um módulo para acompanhar props, placares, lesões e jogos ao vivo em um painel único.</p>
        </div>
        <div className="homeStatusGrid">
          <HomeStat label="Jogadores no radar NBA" value={PREGAME_PLAYERS.length} />
          <HomeStat label="Módulos" value={MODULES.length} />
          <HomeStat label="Esportes" value="7" />
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
              <span className="quickIcon">{item.icon}</span>
              <strong>{item.label}</strong>
              <em>{item.text}</em>
            </button>
          ))}
        </div>
      </section>
      <div className="moduleGrid">
        {MODULES.map((item) => (
          <button
            className={`moduleCard module-${item.key}`}
            key={item.key}
            type="button"
            onClick={() => onNavigate(item.key === 'injuries' ? 'nba-injuries' : item.key)}
          >
            <span className="moduleIcon">{item.icon}</span>
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

