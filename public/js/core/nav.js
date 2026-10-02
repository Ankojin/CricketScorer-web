// Screen and route navigation.
function updateBottomNavVisibility(screenId) {
  const bottomNav = document.getElementById('bottomNav');
  if (!bottomNav) return;

  const isQuickMode = (activeMatch?.scoringMode === 'QUICK') || (currentScoringMode === 'QUICK') || isWebScoreMatch();

  // Hide bottom navigation bar on Home Page, mode landing views, and match setup.
  const hideNavScreens = [
    'screenLanding',
    'screenWebScoreLanding',
    'screenFullMatchLanding',
    'screenAbout',
    'screenInfo',
    'screenNewMatch'
  ];

  if (hideNavScreens.includes(screenId) || (isQuickMode && ['screenLiveScoring', 'screenScorecard', 'screenOvers'].includes(screenId))) {
    bottomNav.style.setProperty('display', 'none', 'important');
  } else {
    bottomNav.style.setProperty('display', 'grid', 'important');
  }
}

function updateBottomNavContext(screenId) {
  const bottomNav = document.getElementById('bottomNav');
  if (!bottomNav) return;

  const isMatchContext = ['screenLiveScoring', 'screenScorecard', 'screenOvers'].includes(screenId);
  bottomNav.dataset.context = isMatchContext ? 'match' : 'general';
  bottomNav.querySelectorAll('[data-nav-context]').forEach(item => {
    item.hidden = item.dataset.navContext !== bottomNav.dataset.context;
  });

  const screenNavIds = {
    screenLanding: 'navHome',
    screenAbout: 'navHome',
    screenInfo: 'navHome',
    screenNewMatch: 'navHome',
    screenSeriesLanding: 'navTournaments',
    screenMatchList: 'navMatches',
    screenPlayers: 'navPlayers',
    screenTournaments: 'navTournaments',
    screenStats: 'navStats',
    screenLiveScoring: 'navLive',
    screenScorecard: 'navScorecard',
    screenOvers: 'navOvers'
  };
  const currentNavId = screenNavIds[screenId];
  if (currentNavId) updateNavState(currentNavId);
}

function showAboutScreen() {
  const authModal = document.getElementById('authModal');
  if (authModal) authModal.classList.remove('active');
  closeFeaturesMenu();
  navigateToRoute('/about');
  updateNavState('navHome');
  showScreen('screenAbout');
}

function showInfoScreen() {
  const authModal = document.getElementById('authModal');
  if (authModal) authModal.classList.remove('active');
  closeFeaturesMenu();
  navigateToRoute('/info');
  updateNavState('navHome');
  showScreen('screenInfo');
}

function openPrivacyPolicy() {
  closeFeaturesMenu();
  window.location.href = '/web-privacy-policy.html';
}

function toggleBottomNavMoreMenu() {
  const menu = document.getElementById('bottomNavMoreMenu');
  const button = document.getElementById('navMore');
  if (!menu || !button) return;
  const opening = menu.hidden;
  menu.hidden = !opening;
  button.setAttribute('aria-expanded', `${opening}`);
  button.classList.toggle('active', opening || button.getAttribute('aria-current') === 'page');
}

function closeBottomNavMoreMenu() {
  const menu = document.getElementById('bottomNavMoreMenu');
  const button = document.getElementById('navMore');
  if (menu) menu.hidden = true;
  if (button) {
    button.setAttribute('aria-expanded', 'false');
    button.classList.toggle('active', button.getAttribute('aria-current') === 'page');
  }
}

function updateTopPageTabs(screenId) {
  const tabsHost = document.getElementById('topPageTabs');
  if (!tabsHost) return;

  const showOnScreens = [
    'screenLanding',
    'screenWebScoreLanding',
    'screenFullMatchLanding',
    'screenSeriesLanding',
    'screenAbout',
    'screenInfo'
  ];

  tabsHost.hidden = !showOnScreens.includes(screenId);

  const tabs = {
    pageTabHome: ['screenLanding', 'screenWebScoreLanding', 'screenFullMatchLanding', 'screenSeriesLanding'],
    pageTabAbout: ['screenAbout'],
    pageTabInfo: ['screenInfo'],
    pageTabPrivacy: []
  };

  Object.entries(tabs).forEach(([id, screens]) => {
    const tab = document.getElementById(id);
    if (!tab) return;
    const active = screens.includes(screenId);
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function showScreen(screenId) {
  document.documentElement.classList.remove('session-restoring');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
  updateTopPageTabs(screenId);
  updateBottomNavVisibility(screenId);
  closeBottomNavMoreMenu();
  updateBottomNavContext(screenId);
}

function updateNavState(activeNavId) {
  document.querySelectorAll('.bottom-nav-item, .more-menu-action').forEach(nav => {
    nav.classList.remove('active');
    nav.removeAttribute('aria-current');
  });
  const activeNav = document.getElementById(activeNavId);
  if (activeNav) {
    activeNav.classList.add('active');
    activeNav.setAttribute('aria-current', 'page');
  }
}

function updateMatchHubHeaders(activeView) {
  const headers = document.querySelectorAll('[data-match-hub]');
  const match = activeMatch;
  headers.forEach(header => {
    header.hidden = !match;
    if (!match) return;

    const teamA = match.teamA?.name || 'Team A';
    const teamB = match.teamB?.name || 'Team B';
    const innings = match.currentInnings || 1;
    const overText = `${Math.floor((match.totalBalls || 0) / 6)}.${(match.totalBalls || 0) % 6} overs`;
    const scoreText = `${match.totalRuns || 0}/${match.totalWickets || 0}`;
    const inningsText = match.target ? `Innings ${innings} · Target ${match.target}` : `Innings ${innings}`;

    header.querySelector('[data-match-hub-teams]').textContent = `${teamA} vs ${teamB}`;
    header.querySelector('[data-match-hub-score]').textContent = scoreText;
    header.querySelector('[data-match-hub-overs]').textContent = `${overText} · ${inningsText}`;
    header.querySelectorAll('[data-match-view]').forEach(tab => {
      const selected = tab.dataset.matchView === activeView;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-current', selected ? 'page' : 'false');
    });
  });
}

function showLiveScreen() {
  updateNavState('navLive');
  showScreen('screenLiveScoring');
  updateMatchHubHeaders('summary');
  renderLiveScoring();
}

function showScorecardScreen() {
  updateNavState('navScorecard');
  showScreen('screenScorecard');
  updateMatchHubHeaders('scorecard');
  updateScorecardTabUI();
  renderScorecard();
}

function showOversScreen() {
  updateNavState('navOvers');
  showScreen('screenOvers');
  updateMatchHubHeaders('overs');
  renderOvers();
}

async function showTournamentsScreen() {
  if (!requireRegisteredScoringMode('Series', { keepCurrentScreen: true })) return;
  updateNavState('navTournaments');
  showScreen('screenTournaments');
  renderTournaments();
}

function showSeriesLandingScreen() {
  const authModal = document.getElementById('authModal');
  if (authModal) authModal.classList.remove('active');
  closeFeaturesMenu();
  navigateToRoute('/series');
  updateNavState('navTournaments');
  showScreen('screenSeriesLanding');
  if (!isRegisteredScoringUser()) {
    showToast('Sign in to create and manage Series', 'info');
  }
}

async function showPlayersScreen() {
  if (!requireRegisteredScoringMode('Teams & Players', { keepCurrentScreen: true })) return;
  updateNavState('navPlayers');
  showScreen('screenPlayers');
  await Promise.all([renderPlayers(), renderGlobalPlayers()]);
  setPlayersDirectoryTab(playersDirectoryTab);
}

function showStatsScreen() {
  if (!requireRegisteredScoringMode('Stats', { keepCurrentScreen: true })) return;
  updateNavState('navStats');
  showScreen('screenStats');
  updateMatchHubHeaders('stats');
  renderStats();
}

function toggleFeaturesMenu(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const menu = document.getElementById('featuresMenuDropdown');
  if (menu) {
    menu.hidden = !menu.hidden;
  }
}

function closeFeaturesMenu() {
  const menu = document.getElementById('featuresMenuDropdown');
  if (menu) {
    menu.hidden = true;
  }
}

function navigateToRoute(routePath) {
  if (window.history && window.history.pushState) {
    try {
      window.history.pushState({}, '', routePath);
    } catch (e) {
      window.location.hash = routePath.replace('/', '#');
    }
  } else {
    window.location.hash = routePath.replace('/', '#');
  }
}

function showWebScoreLandingScreen() {
  closeFeaturesMenu();
  navigateToRoute('/web-score');
  showScreen('screenWebScoreLanding');
}

function showQuickMatchLandingScreen() {
  const authModal = document.getElementById('authModal');
  if (authModal) authModal.classList.remove('active');
  closeFeaturesMenu();
  navigateToRoute('/quick-match');

  const btn = document.getElementById('fullMatchLandingBtn');
  const isRegistered = isRegisteredScoringUser();

  if (btn) {
    btn.innerText = isRegistered ? '📋 Start Quick Match Now →' : '🔑 Sign In / Register to Start Quick Match →';
  }

  showScreen('screenFullMatchLanding');
  if (!isRegistered) {
    showToast('Sign in to start Quick Match', 'info');
  }
}

function handleUrlRouting() {
  const path = window.location.pathname.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const hasRouteQuery = route => searchParams.has(route) || searchParams.get('route') === route;
  const hash = window.location.hash.toLowerCase();

  if (path.includes('/admin') || hasRouteQuery('admin') || hash.includes('admin')) {
    showAdminScreen();
    return true;
  } else if (path.includes('/quick-match') || hasRouteQuery('quick-match') || hash.includes('quick-match')) {
    showQuickMatchLandingScreen();
    return true;
  } else if (path.includes('/series') || hasRouteQuery('series') || hash.includes('series')) {
    showSeriesLandingScreen();
    return true;
  } else if (path.includes('/about') || hasRouteQuery('about') || hash.includes('about')) {
    showAboutScreen();
    return true;
  } else if (path.includes('/info') || hasRouteQuery('info') || hash.includes('info')) {
    showInfoScreen();
    return true;
  } else if (path.includes('/web-score') || hasRouteQuery('web-score') || hash.includes('web-score')) {
    showWebScoreLandingScreen();
    return true;
  } else if (path.includes('/full-match') || hasRouteQuery('full-match') || hash.includes('full-match')) {
    showQuickMatchLandingScreen();
    return true;
  } else if (path.includes('/coin-toss') || hasRouteQuery('coin-toss') || hash.includes('coin-toss')) {
    openQuickTossModal();
    return true;
  } else if (path.includes('/settings-gully-rules') || hasRouteQuery('settings-gully-rules') || hash.includes('settings-gully-rules')) {
    openMatchSettingsModal();
    return true;
  }
  return false;
}
