import { useState } from 'react';
import { PregameRadar } from './components/PregameRadar.jsx';
import { PlayerPropsModal } from './components/PlayerPropsModal.jsx';

export default function App() {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  return (
    <main className="appShell">
      <PregameRadar onSelectPlayer={setSelectedPlayer} />
      <PlayerPropsModal playerName={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
    </main>
  );
}
