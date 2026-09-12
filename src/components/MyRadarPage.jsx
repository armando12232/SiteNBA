import { useEffect, useMemo, useState } from 'react';
import { FavoriteButton } from './FavoriteButton.jsx';
import { SportIcon } from './SportIcon.jsx';
import { favoriteKey } from '../api/favorites.js';
import { getPregame as getNbaPregame, getPregameByName as getNbaPregameByName } from '../api/nba.js';
import { getWnbaPregame, getWnbaPregameByName } from '../api/wnba.js';
import { comparisonValue, comparisonWinner } from '../utils/playerComparison.js';

const COMPARISON_STATS = [
  ['pts', 'Pontos L5'],
  ['reb', 'Rebotes L5'],
  ['ast', 'Assistências L5'],
  ['fg3m', '3PT L5'],
];

export function MyRadarPage({ error, favorites, hasSession, onNeedAuth, onSelectPlayer, onToggle, savingKey }) {
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [comparison, setComparison] = useState({ loading: false, players: [], error: '' });
  const selectedPlayers = useMemo(() => selectedKeys
    .map((key) => favorites.find((player) => favoriteKey(player) === key))
    .filter(Boolean), [favorites, selectedKeys]);

  useEffect(() => {
    setSelectedKeys((current) => current.filter((key) => favorites.some((player) => favoriteKey(player) === key)));
  }, [favorites]);

  useEffect(() => {
    if (selectedPlayers.length !== 2) {
      setComparison({ loading: false, players: [], error: '' });
      return undefined;
    }
    let alive = true;
    setComparison({ loading: true, players: [], error: '' });
    Promise.all(selectedPlayers.map((player) => loadPlayer(player).catch(() => ({ ...player, _comparisonError: true }))))
      .then((players) => {
        if (!alive) return;
        const hasData = players.some((player) => COMPARISON_STATS.some(([stat]) => comparisonValue(player, stat) != null));
        setComparison({
          loading: false,
          players,
          error: hasData ? '' : 'Os dados recentes desses jogadores estão indisponíveis agora.',
        });
      });
    return () => {
      alive = false;
    };
  }, [selectedPlayers]);

  function toggleComparison(player) {
    const key = favoriteKey(player);
    setSelectedKeys((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length === 2) return [current[1], key];
      return [...current, key];
    });
  }

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
        <>
          <div className="radar-compare-toolbar panel">
            <div>
              <span>Comparador</span>
              <strong>Escolha dois jogadores</strong>
              <small>Compare as médias recentes sem sair do seu radar.</small>
            </div>
            <div className="radar-compare-progress">
              <b>{selectedKeys.length}/2</b>
              {selectedKeys.length ? <button type="button" onClick={() => setSelectedKeys([])}>Limpar</button> : null}
            </div>
          </div>
          {selectedPlayers.length === 2 ? <ComparisonPanel comparison={comparison} onClear={() => setSelectedKeys([])} /> : null}
          <div className="radar-grid">
          {favorites.map((player) => {
            const key = favoriteKey(player);
            const selected = selectedKeys.includes(key);
            return (
              <article className={`radar-player-card ${selected ? 'selected' : ''}`} key={key}>
                <div className="radar-player-top">
                  <span className={`radar-league ${player.league}`}>{player.league.toUpperCase()}</span>
                  <div className="radar-player-actions">
                    <button type="button" className={`radar-compare-toggle ${selected ? 'active' : ''}`} aria-pressed={selected} onClick={() => toggleComparison(player)}>
                      {selected ? 'Selecionado' : 'Comparar'}
                    </button>
                    <FavoriteButton
                      active
                      disabled={savingKey === key}
                      onToggle={() => onToggle(player)}
                      playerName={player.player_name}
                    />
                  </div>
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
        </>
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

function ComparisonPanel({ comparison, onClear }) {
  if (comparison.loading) return <div className="radar-comparison panel" role="status">Carregando comparação recente...</div>;
  if (comparison.error) return <div className="radar-comparison panel"><div className="alertBox">{comparison.error}</div><button type="button" className="radar-comparison-clear" onClick={onClear}>Escolher outros</button></div>;
  const [left, right] = comparison.players;
  if (!left || !right) return null;
  return (
    <section className="radar-comparison panel" aria-label={`Comparação entre ${left.player_name} e ${right.player_name}`}>
      <div className="radar-comparison-head">
        <div>
          <span>Comparação recente</span>
          <strong>Lado a lado</strong>
        </div>
        <button type="button" className="radar-comparison-clear" onClick={onClear}>Fechar</button>
      </div>
      <div className="radar-comparison-grid">
        <div className="radar-comparison-player left"><strong>{left.player_name}</strong><small>{left.team_abbr || left.league.toUpperCase()}</small></div>
        <div className="radar-comparison-versus">VS</div>
        <div className="radar-comparison-player right"><strong>{right.player_name}</strong><small>{right.team_abbr || right.league.toUpperCase()}</small></div>
        {COMPARISON_STATS.map(([stat, label]) => {
          const leftValue = comparisonValue(left, stat);
          const rightValue = comparisonValue(right, stat);
          const winner = comparisonWinner(left, right, stat);
          return (
            <div className="radar-comparison-row" key={stat}>
              <b className={winner === 'left' ? 'leader' : ''}>{formatComparisonValue(leftValue)}</b>
              <span>{label}</span>
              <b className={winner === 'right' ? 'leader' : ''}>{formatComparisonValue(rightValue)}</b>
            </div>
          );
        })}
      </div>
      <p>Usa a média dos últimos 5 jogos; quando ela não existe, mostra a média da temporada.</p>
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

async function loadPlayer(player) {
  const isWnba = player.league === 'wnba';
  const request = player.player_id
    ? (isWnba ? getWnbaPregame(player.player_id) : getNbaPregame(player.player_id))
    : (isWnba ? getWnbaPregameByName(player.player_name) : getNbaPregameByName(player.player_name));
  const data = await request;
  if (!data || data.error) throw new Error('comparison unavailable');
  return { ...player, ...data, league: player.league };
}

function formatComparisonValue(value) {
  return value == null ? '-' : Number(value).toFixed(1);
}

