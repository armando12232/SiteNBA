import { useState } from 'react';
import { LiveMonitor } from './components/LiveMonitor.jsx';
import { PregameRadar } from './components/PregameRadar.jsx';
import { PlayerPropsModal } from './components/PlayerPropsModal.jsx';

export default function App() {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [activeView, setActiveView] = useState('pregame');

  return (
    <main className="appShell">
      <nav className="reactNav">
        <button className={activeView === 'pregame' ? 'active' : ''} onClick={() => setActiveView('pregame')}>Pre-game</button>
        <button className={activeView === 'live' ? 'active' : ''} onClick={() => setActiveView('live')}>Ao vivo</button>
      </nav>
      {activeView === 'pregame' ? <PregameRadar onSelectPlayer={setSelectedPlayer} /> : <LiveMonitor />}
      <PlayerPropsModal playerName={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
    </main>
  );
}
