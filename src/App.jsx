import { useState } from 'react';
import { FootballPage } from './components/FootballPage.jsx';
import { HomePage } from './components/HomePage.jsx';
import { InjuriesPage } from './components/InjuriesPage.jsx';
import { LiveMonitor } from './components/LiveMonitor.jsx';
import { PregameRadar } from './components/PregameRadar.jsx';
import { PlayerPropsModal } from './components/PlayerPropsModal.jsx';
import { SportsPage } from './components/SportsPage.jsx';

export default function App() {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [page, setPage] = useState('nba');
  const [nbaTab, setNbaTab] = useState('pregame');

  function navigate(nextPage) {
    if (nextPage === 'nba-injuries') {
      setPage('nba');
      setNbaTab('injuries');
      return;
    }
    setPage(nextPage);
    if (nextPage === 'nba') setNbaTab('pregame');
  }

  return (
    <>
      <div className={`field-bg field-bg-${page}`} aria-hidden="true" />
      <header className="header">
        <div className="header-left">
          <div className="logo-icon">
            <div className="brandMark">SC</div>
          </div>
          <div className="logo-text">StatCast <span>BR</span></div>
          <div className="live-pill"><span className="live-dot" /> {pageLabel(page, nbaTab)}</div>
        </div>
        <div className="header-right">
          <span className="header-date">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
        </div>
      </header>
      <main className={`main page-${page}`}>
        <nav className="page-nav main-nav">
          {['home', 'nba', 'nfl', 'nhl', 'mlb', 'football'].map((item) => (
            <button
              className={`page-nav-btn ${page === item ? 'active' : ''}`}
              key={item}
              type="button"
              onClick={() => navigate(item)}
            >
              <span className="navIcon">{navIcon(item)}</span>
              {navLabel(item)}
            </button>
          ))}
        </nav>

        {page === 'home' ? <HomePage onNavigate={navigate} /> : null}

        {page === 'nba' ? (
          <>
            <nav className="page-nav nba-tabs">
              <button className={`page-nav-btn ${nbaTab === 'pregame' ? 'active' : ''}`} onClick={() => setNbaTab('pregame')}><span className="navIcon">PP</span>Player Props</button>
              <button className={`page-nav-btn ${nbaTab === 'live' ? 'active' : ''}`} onClick={() => setNbaTab('live')}><span className="navIcon liveMark">ON</span>Ao Vivo</button>
              <button className={`page-nav-btn ${nbaTab === 'injuries' ? 'active' : ''}`} onClick={() => setNbaTab('injuries')}><span className="navIcon">INJ</span>Lesões</button>
            </nav>
            {nbaTab === 'pregame' ? <PregameRadar onSelectPlayer={setSelectedPlayer} /> : null}
            {nbaTab === 'live' ? <LiveMonitor /> : null}
            {nbaTab === 'injuries' ? <InjuriesPage /> : null}
          </>
        ) : null}

        {page === 'football' ? <FootballPage /> : null}
        {['nfl', 'nhl', 'mlb'].includes(page) ? <SportsPage league={page} /> : null}

        <PlayerPropsModal playerName={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      </main>
    </>
  );
}

function navLabel(page) {
  return {
    home: 'Home',
    nba: 'NBA',
    nfl: 'NFL',
    nhl: 'NHL',
    mlb: 'MLB',
    football: 'Futebol',
  }[page];
}

function navIcon(page) {
  return {
    home: 'SC',
    nba: 'NBA',
    nfl: 'NFL',
    nhl: 'NHL',
    mlb: 'MLB',
    football: 'FT',
  }[page];
}

function pageLabel(page, nbaTab) {
  if (page === 'nba') return nbaTab === 'live' ? 'NBA Live' : nbaTab === 'injuries' ? 'Lesões' : 'NBA';
  return navLabel(page);
}
