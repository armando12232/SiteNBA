import { useState } from 'react';
import { LiveMonitor } from './components/LiveMonitor.jsx';
import { PregameRadar } from './components/PregameRadar.jsx';
import { PlayerPropsModal } from './components/PlayerPropsModal.jsx';

export default function App() {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [activeView, setActiveView] = useState('pregame');

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="logo-icon">
            <div className="brandMark">SC</div>
          </div>
          <div className="logo-text">StatCast <span>BR</span></div>
          <div className="live-pill"><span className="live-dot" /> NBA</div>
        </div>
        <div className="header-right">
          <span className="header-date">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
        </div>
      </header>
      <main className="main">
        <nav className="page-nav nba-tabs">
          <span className={`page-nav-pill ${activeView}`} />
          <button className={`page-nav-btn ${activeView === 'pregame' ? 'active' : ''}`} onClick={() => setActiveView('pregame')}>Player Props</button>
          <button className={`page-nav-btn ${activeView === 'live' ? 'active' : ''}`} onClick={() => setActiveView('live')}>Ao Vivo</button>
          <button className="page-nav-btn disabled" type="button" aria-disabled="true">Lesoes</button>
        </nav>
        {activeView === 'pregame' ? <PregameRadar onSelectPlayer={setSelectedPlayer} /> : <LiveMonitor />}
        <PlayerPropsModal playerName={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      </main>
    </>
  );
}
