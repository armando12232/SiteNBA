import { useState } from 'react';
import { FootballPage } from './components/FootballPage.jsx';
import { HomePage } from './components/HomePage.jsx';
import { InjuriesPage } from './components/InjuriesPage.jsx';
import { LiveMonitor } from './components/LiveMonitor.jsx';
import { PregameRadar } from './components/PregameRadar.jsx';
import { PlayerPropsModal } from './components/PlayerPropsModal.jsx';
import { SportsPage } from './components/SportsPage.jsx';
import { SubscriptionWidget } from './components/SubscriptionWidget.jsx';
import { AdminPage } from './components/AdminPage.jsx';
import { getPlanAccess } from './api/subscriptions.js';

export default function App() {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [account, setAccount] = useState({ session: null, subscription: { plan: 'free', role: 'guest' } });
  const [page, setPage] = useState('nba');
  const [nbaTab, setNbaTab] = useState('pregame');
  const [lockedFeature, setLockedFeature] = useState(null);
  const access = getPlanAccess(account.subscription?.plan);
  const adminRoute = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('admin') === '1';

  function navigate(nextPage) {
    if (nextPage === 'nba-injuries') {
      setPage('nba');
      setNbaTab('injuries');
      return;
    }
    setPage(nextPage);
    if (nextPage === 'nba') setNbaTab('pregame');
    setLockedFeature(null);
  }

  function selectPlayer(player) {
    if (!access.modal) {
      setLockedFeature('modal');
      return;
    }
    setSelectedPlayer(player);
  }

  function canOpenPage(nextPage) {
    if (nextPage === 'football') return access.football;
    if (['nfl', 'nhl', 'mlb'].includes(nextPage)) return access.sports;
    return true;
  }

  function setNbaTabGuard(nextTab) {
    if (nextTab === 'live' && !access.live) {
      setLockedFeature('live');
      return;
    }
    if (nextTab === 'injuries' && !access.injuries) {
      setLockedFeature('injuries');
      return;
    }
    setNbaTab(nextTab);
    setLockedFeature(null);
  }

  if (adminRoute) return <AdminPage />;

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
          <SubscriptionWidget onSubscriptionChange={setAccount} />
        </div>
      </header>
      <main className={`main page-${page}`}>
        <nav className="page-nav main-nav">
          {['home', 'nba', 'nfl', 'nhl', 'mlb', 'football'].map((item) => (
            <button
              className={`page-nav-btn ${page === item ? 'active' : ''}`}
              key={item}
              type="button"
              onClick={() => (canOpenPage(item) ? navigate(item) : setLockedFeature(item))}
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
              <button className={`page-nav-btn ${nbaTab === 'pregame' ? 'active' : ''}`} onClick={() => setNbaTabGuard('pregame')}><span className="navIcon">PP</span>Player Props</button>
              <button className={`page-nav-btn ${nbaTab === 'live' ? 'active' : ''} ${!access.live ? 'locked' : ''}`} onClick={() => setNbaTabGuard('live')}><span className="navIcon liveMark">ON</span>Ao Vivo</button>
              <button className={`page-nav-btn ${nbaTab === 'injuries' ? 'active' : ''} ${!access.injuries ? 'locked' : ''}`} onClick={() => setNbaTabGuard('injuries')}><span className="navIcon">INJ</span>Lesões</button>
            </nav>
            {lockedFeature ? <PlanPaywall feature={lockedFeature} plan={account.subscription?.plan} /> : null}
            {nbaTab === 'pregame' ? <PregameRadar access={access} onSelectPlayer={selectPlayer} /> : null}
            {nbaTab === 'live' && access.live ? <LiveMonitor /> : null}
            {nbaTab === 'injuries' && access.injuries ? <InjuriesPage /> : null}
          </>
        ) : null}

        {page === 'football' && access.football ? <FootballPage /> : null}
        {['nfl', 'nhl', 'mlb'].includes(page) && access.sports ? <SportsPage league={page} /> : null}
        {lockedFeature && page !== 'nba' ? <PlanPaywall feature={lockedFeature} plan={account.subscription?.plan} /> : null}

        <PlayerPropsModal playerName={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      </main>
    </>
  );
}

function PlanPaywall({ feature, plan }) {
  return (
    <section className="paywallBox">
      <div>
        <span>Plano atual: {plan || 'free'}</span>
        <strong>Recurso bloqueado</strong>
        <p>{featureLabel(feature)} exige upgrade. Clique no badge do plano no topo para assinar.</p>
      </div>
    </section>
  );
}

function featureLabel(feature) {
  return {
    live: 'NBA ao vivo',
    injuries: 'lesões NBA',
    football: 'futebol',
    nfl: 'NFL',
    nhl: 'NHL',
    mlb: 'MLB',
    modal: 'modal completo do jogador',
  }[feature] || feature;
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
