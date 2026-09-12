import { PREGAME_PLAYERS } from '../data/pregamePlayers.js';
import { SportIcon } from './SportIcon.jsx';

const MODULES = [
  { key: 'wnba', icon: 'basketball', title: 'WNBA', text: 'Placar, agenda e jogos ao vivo da liga feminina.', action: 'Abrir WNBA', status: 'Novo' },
  { key: 'nba', icon: 'chart', title: 'Player Props', text: 'Hit rates L5-L20, linhas, edge e modal com histórico real.', action: 'Abrir NBA', status: 'Core' },
  { key: 'football', icon: 'soccer', title: 'Futebol', text: 'Jogos do dia, ao vivo, odds, estatísticas e contexto da partida.', action: 'Abrir Futebol', status: 'Novo' },
  { key: 'cs2', icon: 'gamepad', title: 'CS2', text: 'Radar de confrontos, mapas, forma recente e leitura por score.', action: 'Abrir CS2', status: 'Novo' },
  { key: 'nfl', icon: 'americanFootball', title: 'NFL', text: 'Placar e agenda para acompanhar os próximos jogos.', action: 'Abrir NFL', status: 'Base' },
  { key: 'nhl', icon: 'hockey', title: 'NHL', text: 'Hockey ao vivo, placares e calendário.', action: 'Abrir NHL', status: 'Base' },
  { key: 'mlb', icon: 'baseball', title: 'MLB', text: 'Baseball, jogos do dia e classificação.', action: 'Abrir MLB', status: 'Base' },
  { key: 'injuries', icon: 'medical', title: 'Lesões NBA', text: 'Jogadores fora, questionáveis e prováveis.', action: 'Ver lesões', status: 'NBA' },
];

const QUICK_ACTIONS = [
  { icon: 'basketball', label: 'WNBA', target: 'wnba', text: 'Jogos e placares' },
  { icon: 'chart', label: 'NBA Props', target: 'nba', text: 'Radar de props pré-jogo' },
  { icon: 'medical', label: 'NBA Lesões', target: 'nba-injuries', text: 'Disponibilidade dos jogadores' },
  { icon: 'soccer', label: 'Futebol', target: 'football', text: 'Jogos, odds e estatísticas' },
  { icon: 'gamepad', label: 'CS2', target: 'cs2', text: 'Confrontos e mapas' },
  { icon: 'americanFootball', label: 'NFL', target: 'nfl', text: 'Placar e agenda' },
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
              <span className="quickIcon"><SportIcon name={item.icon} /></span>
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
            <span className="moduleIcon"><SportIcon name={item.icon} /></span>
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

