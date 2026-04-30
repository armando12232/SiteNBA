import { getSchedule, getScoreboard } from '../api/nba.js';
import { useAsync } from '../hooks/useAsync.js';

export function NbaHealthPanel() {
  const scoreboard = useAsync(getScoreboard, []);
  const schedule = useAsync(getSchedule, []);

  const liveGames = scoreboard.data?.games?.length ?? 0;
  const upcomingGames = schedule.data?.games?.length ?? 0;

  return (
    <section className="panel">
      <div className="eyebrow">NBA API</div>
      <h1>StatCast BR React Shell</h1>
      <p className="muted">
        Base React criada para migrar o site atual por módulos, mantendo as rotas Python em <code>/api</code>.
      </p>

      <div className="metricGrid">
        <Metric
          label="Jogos ao vivo"
          value={scoreboard.loading ? '...' : liveGames}
          error={scoreboard.error}
        />
        <Metric
          label="Agenda"
          value={schedule.loading ? '...' : upcomingGames}
          error={schedule.error}
        />
      </div>
    </section>
  );
}

function Metric({ label, value, error }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={error ? 'error' : ''}>{error ? 'erro' : value}</strong>
      {error ? <small>{error.message}</small> : null}
    </div>
  );
}
