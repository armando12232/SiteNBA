import { FavoriteButton } from './FavoriteButton.jsx';
import { SportIcon } from './SportIcon.jsx';
import { favoriteKey } from '../api/favorites.js';

export function MyRadarPage({ error, favorites, hasSession, onNeedAuth, onSelectPlayer, onToggle, savingKey }) {
  if (!hasSession) {
    return (
      <section className="my-radar-page">
        <RadarHeader count={0} />
        <div className="radar-empty panel">
          <span className="radar-empty-icon"><SportIcon name="star" /></span>
          <strong>Seu radar começa aqui</strong>
          <p>Entre na conta para salvar jogadores da NBA e WNBA e acessar a mesma lista em qualquer dispositivo.</p>
          <button type="button" onClick={onNeedAuth}>Entrar na conta</button>
        </div>
      </section>
    );
  }

  return (
    <section className="my-radar-page">
      <RadarHeader count={favorites.length} />
      {error ? <div className="alertBox">{error}</div> : null}
      {favorites.length ? (
        <div className="radar-grid">
          {favorites.map((player) => {
            const key = favoriteKey(player);
            return (
              <article className="radar-player-card" key={key}>
                <div className="radar-player-top">
                  <span className={`radar-league ${player.league}`}>{player.league.toUpperCase()}</span>
                  <FavoriteButton
                    active
                    disabled={savingKey === key}
                    onToggle={() => onToggle(player)}
                    playerName={player.player_name}
                  />
                </div>
                <button type="button" className="radar-player-open" onClick={() => onSelectPlayer(player)}>
                  <span className="radar-player-avatar">{initials(player.player_name)}</span>
                  <span>
                    <strong>{player.player_name}</strong>
                    <small>{player.team_abbr || 'Time não informado'} / Ver análise completa</small>
                  </span>
                  <em>→</em>
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="radar-empty panel">
          <span className="radar-empty-icon"><SportIcon name="star" /></span>
          <strong>Nenhum jogador salvo</strong>
          <p>Abra NBA ou WNBA e use a estrela ao lado do jogador para montar seu painel.</p>
        </div>
      )}
    </section>
  );
}

function RadarHeader({ count }) {
  return (
    <>
      <div className="section-header radar-header">
        <div>
          <span>Área pessoal</span>
          <h1>Meu Radar</h1>
        </div>
        <div className="section-line" />
        <strong>{count} {count === 1 ? 'jogador' : 'jogadores'}</strong>
      </div>
      <p className="radar-lead">Sua lista de jogadores para abrir análises e acompanhar com menos distração.</p>
    </>
  );
}

function initials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

