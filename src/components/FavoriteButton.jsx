import { SportIcon } from './SportIcon.jsx';

export function FavoriteButton({ active, disabled = false, onToggle, playerName }) {
  return (
    <button
      type="button"
      className={`favorite-btn ${active ? 'active' : ''}`}
      aria-label={`${active ? 'Remover' : 'Adicionar'} ${playerName} ${active ? 'do' : 'ao'} Meu Radar`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onToggle}
      title={active ? 'Remover do Meu Radar' : 'Adicionar ao Meu Radar'}
    >
      <SportIcon name="star" />
    </button>
  );
}

