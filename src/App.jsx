import { lazy, Suspense, useEffect, useState } from 'react';
import { PregameRadar } from './components/PregameRadar.jsx';
import { SubscriptionWidget } from './components/SubscriptionWidget.jsx';
import { SportIcon } from './components/SportIcon.jsx';
import { PageBoundary } from './components/PageBoundary.jsx';
import { getPlanAccess } from './api/subscriptions.js';
import { requiredPageFeature } from './utils/navigation.js';
import { favoriteKey, favoritesFromSession, persistFavorites, toggleFavoriteList } from './api/favorites.js';

const FootballPage = lazy(() => import('./components/FootballPage.jsx').then((module) => ({ default: module.FootballPage })));
const HomePage = lazy(() => import('./components/HomePage.jsx').then((module) => ({ default: module.HomePage })));
const InjuriesPage = lazy(() => import('./components/InjuriesPage.jsx').then((module) => ({ default: module.InjuriesPage })));
const LiveMonitor = lazy(() => import('./components/LiveMonitor.jsx').then((module) => ({ default: module.LiveMonitor })));
const PlayerPropsModal = lazy(() => import('./components/PlayerPropsModal.jsx').then((module) => ({ default: module.PlayerPropsModal })));
const SportsPage = lazy(() => import('./components/SportsPage.jsx').then((module) => ({ default: module.SportsPage })));
const AdminPage = lazy(() => import('./components/AdminPage.jsx').then((module) => ({ default: module.AdminPage })));
const WnbaPage = lazy(() => import('./components/WnbaPage.jsx').then((module) => ({ default: module.WnbaPage })));
const Cs2Page = lazy(() => import('./components/Cs2Page.jsx').then((module) => ({ default: module.Cs2Page })));
const MyRadarPage = lazy(() => import('./components/MyRadarPage.jsx').then((module) => ({ default: module.MyRadarPage })));

export default function App() {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [account, setAccount] = useState({ session: null, subscription: { plan: 'free', role: 'guest' } });
  const [page, setPage] = useState('nba');
  const [nbaTab, setNbaTab] = useState('pregame');
  const [lockedFeature, setLockedFeature] = useState(null);
  const [favoriteState, setFavoriteState] = useState({ items: [], savingKey: '', error: '' });
  const access = getPlanAccess(account.subscription);
  const pageFeature = requiredPageFeature(page, nbaTab);
  const deniedFeature = pageFeature && !access[pageFeature]
    ? (page === 'nba' ? nbaTab : page)
    : lockedFeature;
  const adminRoute = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('admin') === '1';

  useEffect(() => {
    setFavoriteState({ items: favoritesFromSession(account.session), savingKey: '', error: '' });
  }, [account.session]);

  function navigate(nextPage) {
    const feature = requiredPageFeature(nextPage);
    if (feature && !access[feature]) {
      setLockedFeature(nextPage === 'nba-injuries' ? 'injuries' : nextPage);
      return;
    }
    setSelectedPlayer(null);
    setLockedFeature(null);
    if (nextPage === 'nba-injuries') {
      setPage('nba');
      setNbaTab('injuries');
      return;
    }
    setPage(nextPage);
    if (nextPage === 'nba') setNbaTab('pregame');
  }

  function selectPlayer(player) {
    if (!access.modal) {
      setLockedFeature('modal');
      return;
    }
    setSelectedPlayer(player);
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

  async function toggleFavorite(player) {
    if (!account.session) {
      window.dispatchEvent(new CustomEvent('statcast:open-auth'));
      return;
    }
    if (favoriteState.savingKey) return;
    const previous = favoriteState.items;
    const next = toggleFavoriteList(previous, player);
    if (!next.key) return;
    setFavoriteState({ items: next.favorites, savingKey: next.key, error: '' });
    try {
      const { data, error } = await persistFavorites(next.favorites);
      if (error) throw error;
      const saved = data?.user ? favoritesFromSession({ user: data.user }) : next.favorites;
      setFavoriteState({ items: saved, savingKey: '', error: '' });
    } catch {
      setFavoriteState({ items: previous, savingKey: '', error: 'Não foi possível salvar seu radar agora. Tente novamente.' });
    }
  }

  if (adminRoute) return <PageBoundary><Suspense fallback={<PageLoading />}><AdminPage /></Suspense></PageBoundary>;

  return (
    <>
      <a className="skipLink" href="#main-content">Ir para o conteúdo</a>
      <div className={`field-bg field-bg-${page}`} aria-hidden="true" />
      <header className="header">
        <div className="header-left">
          <div className="logo-icon">
            <div className="brandMark">SC</div>
          </div>
          <div className="logo-text">StatCast <span>BR</span></div>
          <div className="live-pill">{pageLabel(page, nbaTab)}</div>
        </div>
        <div className="header-right">
          <span className="header-date">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
          <SubscriptionWidget onSubscriptionChange={setAccount} />
        </div>
      </header>
      <div className="app-shell">
        <aside className="sport-sidebar">
          <div className="sidebar-label">Explorar</div>
          <nav className="page-nav main-nav" aria-label="Esportes e início">
            {['home', 'radar', 'nba', 'wnba', 'football', 'cs2', 'nfl', 'nhl', 'mlb'].map((item) => (
              <button
                className={`page-nav-btn ${page === item ? 'active' : ''}`}
                key={item}
                type="button"
                aria-pressed={page === item}
                onClick={() => navigate(item)}
              >
                <span className="navIcon"><SportIcon name={navIcon(item)} /></span>
                <span className="navLabel">{navLabel(item)}</span>
              </button>
            ))}
          </nav>
        </aside>
        <main id="main-content" tabIndex={-1} className={`main page-${page}`}>

        {deniedFeature ? <PlanPaywall feature={deniedFeature} plan={account.subscription?.plan} /> : null}
        <PageBoundary key={`${page}:${nbaTab}`}>
        <Suspense fallback={<PageLoading />}>
        {page === 'home' ? <HomePage onNavigate={navigate} /> : null}
        {page === 'radar' ? (
          <MyRadarPage
            error={favoriteState.error}
            favorites={favoriteState.items}
            hasSession={Boolean(account.session)}
            onNeedAuth={() => window.dispatchEvent(new CustomEvent('statcast:open-auth'))}
            onSelectPlayer={selectPlayer}
            onToggle={toggleFavorite}
            savingKey={favoriteState.savingKey}
          />
        ) : null}

        {page === 'nba' ? (
          <>
            <nav className="page-nav nba-tabs" aria-label="Recursos da NBA">
              <button aria-pressed={nbaTab === 'pregame'} className={`page-nav-btn ${nbaTab === 'pregame' ? 'active' : ''}`} onClick={() => setNbaTabGuard('pregame')}><span className="navIcon"><SportIcon name="chart" /></span>Player Props</button>
              <button aria-pressed={nbaTab === 'live'} className={`page-nav-btn ${nbaTab === 'live' ? 'active' : ''} ${!access.live ? 'locked' : ''}`} onClick={() => setNbaTabGuard('live')}><span className="navIcon liveMark"><SportIcon name="live" /></span>Ao Vivo</button>
              <button aria-pressed={nbaTab === 'injuries'} className={`page-nav-btn ${nbaTab === 'injuries' ? 'active' : ''} ${!access.injuries ? 'locked' : ''}`} onClick={() => setNbaTabGuard('injuries')}><span className="navIcon"><SportIcon name="medical" /></span>Lesões</button>
            </nav>
            {nbaTab === 'pregame' ? <PregameRadar access={access} favorites={favoriteState.items} onSelectPlayer={selectPlayer} onToggleFavorite={toggleFavorite} savingFavoriteKey={favoriteState.savingKey} /> : null}
            {nbaTab === 'live' && access.live ? <LiveMonitor /> : null}
            {nbaTab === 'injuries' && access.injuries ? <InjuriesPage /> : null}
          </>
        ) : null}

        {page === 'football' && access.football ? <FootballPage /> : null}
        {page === 'cs2' && access.cs2 ? <Cs2Page /> : null}
        {page === 'wnba' && access.sports ? <WnbaPage favorites={favoriteState.items} onSelectPlayer={selectPlayer} onToggleFavorite={toggleFavorite} savingFavoriteKey={favoriteState.savingKey} /> : null}
        {['nfl', 'nhl', 'mlb'].includes(page) && access.sports ? <SportsPage key={page} league={page} /> : null}
        </Suspense>
        </PageBoundary>
        {selectedPlayer && access.modal ? (
          <PageBoundary>
            <Suspense fallback={<PageLoading />}>
              <PlayerPropsModal favorites={favoriteState.items} onToggleFavorite={toggleFavorite} playerName={selectedPlayer} onClose={() => setSelectedPlayer(null)} savingFavoriteKey={favoriteState.savingKey} />
            </Suspense>
          </PageBoundary>
        ) : null}
        </main>
      </div>
    </>
  );
}

function PageLoading() {
  return <div className="loadingGrid" role="status">Carregando módulo...</div>;
}

function PlanPaywall({ feature, plan }) {
  const details = featureAccessDetails(feature);
  return (
    <section className="paywallBox" role="status">
      <div className="paywallIcon">🔒</div>
      <div>
        <span>Plano atual: {plan || 'free'}</span>
        <strong>{details.title}</strong>
        <p>{details.description}</p>
        <div className="paywallMeta">
          <em>{details.plan}</em>
          <b>Clique no badge do plano no topo para assinar ou trocar de plano.</b>
        </div>
        <button type="button" className="paywallCta" onClick={openPricingModal}>
          Ver planos
        </button>
      </div>
    </section>
  );
}

function openPricingModal() {
  window.dispatchEvent(new CustomEvent('statcast:open-pricing'));
}

function featureAccessDetails(feature) {
  return {
    live: {
      title: 'NBA ao vivo bloqueado',
      description: 'Alertas em tempo real, box score e jogadores em destaque ficam disponíveis nos planos pagos.',
      plan: 'Libera no Pro+',
    },
    injuries: {
      title: 'Lesões NBA bloqueado',
      description: 'O relatório de lesões por time é um módulo pago por depender de chamadas externas frequentes.',
      plan: 'Libera no Pro+',
    },
    football: {
      title: 'Futebol bloqueado',
      description: 'Jogos do dia, odds, árbitro e estatísticas ficam disponíveis nos planos Pro e Premium.',
      plan: 'Libera no Pro+',
    },
    cs2: {
      title: 'CS2 bloqueado',
      description: 'Radar de confrontos, mapas, forma recente e leitura premium de Counter-Strike faz parte do pacote multi-esportes.',
      plan: 'Libera no Pro+',
    },
    nfl: {
      title: 'NFL bloqueado',
      description: 'Placar e agenda de esportes extras fazem parte do pacote multi-esportes.',
      plan: 'Libera no Pro+',
    },
    wnba: {
      title: 'WNBA bloqueado',
      description: 'Placar, agenda e acompanhamento da WNBA fazem parte do pacote multi-esportes.',
      plan: 'Libera no Pro+',
    },
    nhl: {
      title: 'NHL bloqueado',
      description: 'Placar e agenda de esportes extras fazem parte do pacote multi-esportes.',
      plan: 'Libera no Pro+',
    },
    mlb: {
      title: 'MLB bloqueado',
      description: 'Placar e agenda de esportes extras fazem parte do pacote multi-esportes.',
      plan: 'Libera no Pro+',
    },
    modal: {
      title: 'Modal completo bloqueado',
      description: 'Histórico real, gráfico, hit rates e leitura detalhada do jogador exigem plano ativo.',
      plan: 'Libera no Basic+',
    },
  }[feature] || {
    title: 'Recurso bloqueado',
    description: 'Este módulo exige upgrade para liberar a visualização completa.',
    plan: 'Plano pago necessário',
  };
}

function navLabel(page) {
  return {
    home: 'Home',
    radar: 'Meu Radar',
    nba: 'NBA',
    wnba: 'WNBA',
    cs2: 'CS2',
    nfl: 'NFL',
    nhl: 'NHL',
    mlb: 'MLB',
    football: 'Futebol',
  }[page];
}

function navIcon(page) {
  return {
    wnba: 'basketball',
    cs2: 'gamepad',
    home: 'home',
    radar: 'star',
    nba: 'basketball',
    nfl: 'americanFootball',
    nhl: 'hockey',
    mlb: 'baseball',
    football: 'soccer',
  }[page];
}

function pageLabel(page, nbaTab) {
  if (page === 'nba') return nbaTab === 'live' ? 'NBA Live' : nbaTab === 'injuries' ? 'Lesões' : 'NBA';
  return navLabel(page);
}

