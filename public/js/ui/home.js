// home UI module.
function showLandingScreen() {
  if (window.location.pathname !== '/') {
    navigateToRoute('/');
  }
  showScreen('screenLanding');
  renderHomeDashboard();
}

function isWebScoreMatch(match = activeMatch) {
  return match?.scoringMode === 'WEBSCORE' || currentScoringMode === 'WEBSCORE';
}

function isRegisteredScoringUser() {
  return Boolean(window.CricStorage.getCurrentUser()) || localStorage.getItem('cric_user_mode') === 'REGISTERED';
}

function updateScoringModeAccess(isRegistered = isRegisteredScoringUser()) {
  const fullMatchButton = document.getElementById('featureFullMatchBtn');
  const signInPrompt = document.getElementById('webScoreSignInPrompt');
  if (fullMatchButton) fullMatchButton.hidden = !isRegistered;
  if (signInPrompt) signInPrompt.hidden = isRegistered;
}

function requireRegisteredScoringMode(modeName) {
  if (isRegisteredScoringUser()) return true;
  navigateToRoute('/');
  showLandingScreen();
  showToast(`Sign in or Register to access ${modeName}`, 'info');
  openAuthModal('LOGIN');
  return false;
}

function startFullMatch() {
  closeFeaturesMenu();
  if (!requireRegisteredScoringMode('Full Match')) return;

  currentScoringMode = 'FULL';
  showNewMatchScreen('FULL');
}

async function renderHomeDashboard() {
  const entry = document.getElementById('landingAuthEntry');
  const dashboard = document.getElementById('homeDashboard');
  const recentList = document.getElementById('homeRecentMatches');
  if (!entry || !dashboard || !recentList) return;

  const userMode = localStorage.getItem('cric_user_mode');
  const user = window.CricStorage.getCurrentUser();
  const isRegistered = Boolean(user) || userMode === 'REGISTERED';
  const hasAppSession = isRegistered || userMode === 'GUEST';
  document.documentElement.classList.toggle('has-app-session', hasAppSession);
  updateScoringModeAccess(isRegistered);
  const recentSection = document.getElementById('homeRecentSection');
  const guestSavedMatchesPrompt = document.getElementById('guestSavedMatchesPrompt');
  if (recentSection) recentSection.hidden = !isRegistered || !hasAppSession;
  if (guestSavedMatchesPrompt) guestSavedMatchesPrompt.hidden = isRegistered || !hasAppSession;

  if (hasAppSession) {
    entry.hidden = true;
    entry.setAttribute('hidden', '');
    dashboard.hidden = false;
    dashboard.removeAttribute('hidden');
  } else {
    entry.hidden = false;
    entry.removeAttribute('hidden');
    dashboard.hidden = true;
    dashboard.setAttribute('hidden', '');
    return;
  }

  // Toggle CTAs based on session state (Guest vs Signed-In)
  const guestCtas = document.getElementById('homeGuestCtas');
  const registeredCtas = document.getElementById('homeRegisteredCtas');
  if (guestCtas && registeredCtas) {
    if (isRegistered) {
      guestCtas.hidden = true;
      guestCtas.setAttribute('hidden', '');
      guestCtas.style.display = 'none';

      registeredCtas.hidden = false;
      registeredCtas.removeAttribute('hidden');
      registeredCtas.style.display = 'flex';
    } else {
      guestCtas.hidden = false;
      guestCtas.removeAttribute('hidden');
      guestCtas.style.display = 'flex';

      registeredCtas.hidden = true;
      registeredCtas.setAttribute('hidden', '');
      registeredCtas.style.display = 'none';
    }
  }
  // Guest mode is limited to Web Score; Full Match requires a signed-in account.
  const featureFullMatchBtn = document.getElementById('featureFullMatchBtn');
  if (featureFullMatchBtn) featureFullMatchBtn.hidden = !isRegistered;

  recentList.replaceChildren();
  try {
    const matches = await window.CricStorage.listMatches();
    const recentMatches = Array.isArray(matches)
      ? matches.slice().sort((a, b) => (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0)).slice(0, 3)
      : [];
    if (!recentMatches.length) {
      const empty = document.createElement('div');
      empty.className = 'home-recent-empty';
      empty.textContent = 'No saved matches yet. Start a Full Match to see it here.';
      recentList.appendChild(empty);
      return;
    }

    recentMatches.forEach(match => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'home-recent-match';
      button.setAttribute('aria-label', `Open ${match.teamA?.name || 'Team A'} versus ${match.teamB?.name || 'Team B'}`);

      const teams = document.createElement('span');
      teams.className = 'home-recent-teams';
      teams.textContent = `${match.teamA?.name || 'Team A'} vs ${match.teamB?.name || 'Team B'}`;

      const score = document.createElement('span');
      score.className = 'home-recent-meta';
      score.textContent = `${match.totalRuns || 0}/${match.totalWickets || 0} · ${match.status || 'LIVE'}`;

      button.append(teams, score);
      button.addEventListener('click', () => selectMatch(match.id));
      recentList.appendChild(button);
    });
  } catch (err) {
    recentList.textContent = 'Unable to load recent matches. Open Match Center to try again.';
  }
}

function startWebScore() {
  currentScoringMode = 'WEBSCORE';
  closeFeaturesMenu();
  showNewMatchScreen('WEBSCORE');
  updateWizardStepUI(0);
}

async function loadMatchListScreen() {
  updateNavState('navMatches');
  showScreen('screenMatchList');

  const listEl = document.getElementById('matchListContainer');
  listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Loading matches...</div>';

  const matches = await window.CricStorage.listMatches();
  listEl.innerHTML = '';

  if (!matches || matches.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No existing or live matches found.</div>';
    return;
  }

  const filteredMatches = matches.filter(m => {
    if (activeMatchFilter === 'LIVE') return !['COMPLETED', 'ABANDONED'].includes(m.status);
    if (activeMatchFilter === 'COMPLETED') return m.status === 'COMPLETED';
    return true;
  });
  if (!filteredMatches.length) {
    const label = activeMatchFilter === 'LIVE' ? 'live' : 'completed';
    listEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">No ${label} matches found.</div>`;
    return;
  }

  filteredMatches.forEach(m => {
    const item = document.createElement('div');
    item.className = 'match-card-item';

    const teamAColor = m.teamA?.colorHex || '#13a968';
    const teamBColor = m.teamB?.colorHex || '#38bdf8';
    const overStr = `${Math.floor((m.totalBalls || 0) / 6)}.${(m.totalBalls || 0) % 6}`;
    const statusColor = m.status === 'COMPLETED' ? 'var(--color-success)' : (m.status === 'ABANDONED' ? 'var(--color-warning)' : 'var(--color-info)');

    item.innerHTML = `
      <div style="flex:1; cursor:pointer;" onclick="selectMatch('${m.id}')">
        <div style="font-weight:700; font-size:15px; color:var(--color-text);">
          <span class="team-badge" style="background:${teamAColor}"></span>${m.teamA?.name || 'Team A'} vs
          <span class="team-badge" style="background:${teamBColor}"></span>${m.teamB?.name || 'Team B'}
        </div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
          Status: <span style="color:${statusColor}; font-weight:600;">${m.status || 'LIVE'}</span> | Overs: ${overStr} / ${m.oversPerInnings || 20}
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="font-size:22px; font-weight:900; color:var(--color-primary); cursor:pointer;" onclick="selectMatch('${m.id}')">
          ${m.totalRuns || 0}/${m.totalWickets || 0}
        </div>
        <button class="btn" style="background:var(--color-danger-soft); color:var(--color-error); border-color:var(--color-error); padding:6px 10px; font-size:12px; border-radius:8px;" onclick="handleDeleteMatch('${m.id}', event)">
          🗑️ Delete
        </button>
      </div>
    `;
    listEl.appendChild(item);
  });
}

function viewAllMatches() {
  setMatchFilter('ALL');
}

function setMatchFilter(filter) {
  if (!['ALL', 'LIVE', 'COMPLETED'].includes(filter)) return;
  activeMatchFilter = filter;
  const styles = {
    ALL: 'matchFilterAll',
    LIVE: 'matchFilterLive',
    COMPLETED: 'matchFilterCompleted'
  };
  Object.entries(styles).forEach(([value, id]) => {
    const button = document.getElementById(id);
    if (!button) return;
    const active = value === filter;
    button.style.background = active ? 'var(--primary-color)' : 'transparent';
    button.style.color = active ? 'var(--color-text-on-dark)' : 'var(--text-muted)';
    button.setAttribute('aria-pressed', `${active}`);
  });
  loadMatchListScreen();
}

async function handleDeleteMatch(matchId, event) {
  if (event) event.stopPropagation();
  if (confirm("Are you sure you want to delete this match permanently?")) {
    await window.CricStorage.deleteMatch(matchId);
    if (activeMatch && activeMatch.id === matchId) {
      activeMatch = null;
    }
    loadMatchListScreen();
  }
}

async function handleDeleteActiveMatch() {
  if (!activeMatch) return;
  if (confirm(`Are you sure you want to delete "${activeMatch.teamA?.name} vs ${activeMatch.teamB?.name}" permanently?`)) {
    const deletedId = activeMatch.id;
    activeMatch = null;
    await window.CricStorage.deleteMatch(deletedId);
    loadMatchListScreen();
  }
}
