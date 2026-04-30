import { NbaHealthPanel } from './components/NbaHealthPanel.jsx';
import { PregameRadar } from './components/PregameRadar.jsx';

export default function App() {
  return (
    <main className="appShell">
      <NbaHealthPanel />
      <PregameRadar />
    </main>
  );
}
