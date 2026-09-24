// App Controller for CricScore Pro Web PWA

let activeMatch = null;
let activeTournament = null;
let activeTourneySubTab = 'TEAMS'; // TEAMS, MATCHES, TABLE, STATS

let currentSelectionType = null; // STRIKER, NON_STRIKER, BOWLER
let selectedTossWinnerId = null;
let selectedTossDecision = 'BAT';

let authTab = 'LOGIN'; // LOGIN or REGISTER
let isReadOnlySpectator = false;
let spectatorPollInterval = null;

// In-Memory Squads for Match Creation
let matchSquadA = []; // Array of { id, name, isCaptain, isViceCaptain }
let matchSquadB = []; // Array of { id, name, isCaptain, isViceCaptain }

// Toast Notification System
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${msg}</span><span style="cursor:pointer; margin-left:8px;" onclick="this.parentElement.remove()">✕</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

window.CricStorage.onToast = showToast;

function updateBottomNavVisibility(screenId) {
  const bottomNav = document.getElementById('bottomNav');
  if (!bottomNav) return;
  if (screenId === 'screenLanding') {
    bottomNav.style.display = 'none';
  } else {
    bottomNav.style.display = 'flex';
  }
}

function showScreen(screenId) {
  document.documentElement.classList.remove('session-restoring');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
  updateBottomNavVisibility(screenId);
}

// Landing & Guest Mode Handlers
function showLandingScreen() {
  showScreen('screenLanding');
}

function continueAsGuest() {
  localStorage.setItem('cric_user_mode', 'GUEST');
  updateAuthUI();
  showToast('Entered Guest Mode (Temporary Local Scoring)', 'info');
  loadMatchListScreen();
}

// Auth UI Controller
function openAuthModal(defaultTab = 'LOGIN') {
  const user = window.CricStorage.getCurrentUser();
  if (user) {
    if (confirm(`Logged in as ${user.email}. Do you want to sign out?`)) {
      window.CricStorage.logout();
      localStorage.removeItem('cric_user_mode');
      updateAuthUI();
      showToast('Signed out successfully', 'info');
      showLandingScreen();
    }
  } else {
    switchAuthTab(defaultTab);
    document.getElementById('authModal').classList.add('active');
  }
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('active');
}

function switchAuthTab(tab) {
  authTab = tab;
  document.getElementById('authTabLogin').style.background = tab === 'LOGIN' ? 'var(--primary-color)' : 'transparent';
  document.getElementById('authTabRegister').style.background = tab === 'REGISTER' ? 'var(--primary-color)' : 'transparent';
  document.getElementById('authNameGroup').style.display = tab === 'REGISTER' ? 'block' : 'none';
}

async function handleAuthSubmit() {
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('authName').value;

  if (!email || !password) {
    showToast('Please enter email and password', 'warning');
    return;
  }

  try {
    if (authTab === 'REGISTER') {
      const user = await window.CricStorage.register(email, password, name);
      localStorage.setItem('cric_user_mode', 'REGISTERED');
      showToast(`Welcome, ${user.name}! Registered & synced to AWS Cloud`, 'success');
    } else {
      const user = await window.CricStorage.login(email, password);
      localStorage.setItem('cric_user_mode', 'REGISTERED');
      showToast(`Welcome back, ${user.name}!`, 'success');
    }
    closeAuthModal();
    updateAuthUI();
    loadMatchListScreen();
  } catch (err) {
    showToast(`Auth error: ${err.message}`, 'danger');
  }
}

function updateAuthUI() {
  const user = window.CricStorage.getCurrentUser();
  const btn = document.getElementById('authBtn');
  const syncBadge = document.getElementById('syncBadge');

  if (user) {
    if (btn) {
      btn.innerText = `👤 ${user.name || user.email.split('@')[0]}`;
      btn.style.background = '#064e3b';
    }
    if (syncBadge) {
      syncBadge.className = 'status-badge online';
      syncBadge.innerText = `🟢 Sync: ${user.name || 'User'}`;
    }
  } else {
    const isGuest = localStorage.getItem('cric_user_mode') === 'GUEST';
    if (btn) {
      btn.innerText = '🔑 Sign In';
      btn.style.background = '#3b82f6';
    }
    if (syncBadge) {
      if (isGuest) {
        syncBadge.className = 'status-badge guest';
        syncBadge.innerText = '🟡 Guest Mode';
      } else {
        syncBadge.className = 'status-badge';
        syncBadge.innerText = '⚪ Sync Inactive';
      }
    }
  }
}

// WhatsApp Live Score Sharing & Spectator Mode
function goLiveShare() {
  if (!activeMatch) return;

  const m = activeMatch;
  const overStr = `${Math.floor((m.totalBalls || 0) / 6)}.${(m.totalBalls || 0) % 6}`;
  const scoreStr = `${m.totalRuns || 0}/${m.totalWickets || 0} (${overStr} Ov)`;
  const matchUrl = `${window.location.origin}${window.location.pathname}?matchId=${m.id}`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(matchUrl).catch(() => {});
  }

  showToast('🟢 Live Spectator Link Copied!', 'success');

  const text = `🏏 *Live Cricket Score*\n*${m.teamA?.name} vs ${m.teamB?.name}*\nScore: *${scoreStr}*\nStatus: ${m.status || 'LIVE'}\n\n👇 *Watch Live Score Updates here:*\n${matchUrl}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

  window.open(whatsappUrl, '_blank');
}

function shareLiveScoreWhatsApp() {
  goLiveShare();
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return '59, 130, 246';
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return '59, 130, 246';
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

// Multi-Tab Persistence Sync
window.addEventListener('storage', (e) => {
  if (e.key === 'cric_matches' && activeMatch && !isReadOnlySpectator) {
    window.CricStorage.getMatch(activeMatch.id).then(updated => {
      if (updated && updated.updatedAt !== activeMatch.updatedAt) {
        activeMatch = window.ScoringEngine.recalculateMatch(updated);
        renderLiveScoring();
      }
    });
  }
});

function updateNavState(activeNavId) {
  document.querySelectorAll('.bottom-nav-item').forEach(nav => nav.classList.remove('active'));
  const activeNav = document.getElementById(activeNavId);
  if (activeNav) activeNav.classList.add('active');
}

function showLiveScreen() {
  updateNavState('navLive');
  showScreen('screenLiveScoring');
  renderLiveScoring();
}

function showScorecardScreen() {
  updateNavState('navScorecard');
  showScreen('screenScorecard');
  renderScorecard();
}

function showOversScreen() {
  updateNavState('navOvers');
  showScreen('screenOvers');
  renderOvers();
}

async function showTournamentsScreen() {
  updateNavState('navTournaments');
  showScreen('screenTournaments');
  renderTournaments();
}

async function showPlayersScreen() {
  updateNavState('navPlayers');
  showScreen('screenPlayers');
  renderPlayers();
}

function showStatsScreen() {
  updateNavState('navStats');
  showScreen('screenStats');
  renderStats();
}

async function loadMatchListScreen() {
  updateNavState('navMatches');
  showScreen('screenMatchList');

  const listEl = document.getElementById('matchListContainer');
  listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Loading matches...</div>';

  const matches = await window.CricStorage.listMatches();
  listEl.innerHTML = '';

  if (!matches || matches.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No matches found. Create a new match to start scoring!</div>';
    return;
  }

  matches.forEach(m => {
    const item = document.createElement('div');
    item.className = 'match-card-item';

    const teamAColor = m.teamA?.colorHex || '#FF5722';
    const teamBColor = m.teamB?.colorHex || '#2196F3';
    const overStr = `${Math.floor((m.totalBalls || 0) / 6)}.${(m.totalBalls || 0) % 6}`;

    item.innerHTML = `
      <div style="flex:1; cursor:pointer;" onclick="selectMatch('${m.id}')">
        <div style="font-weight:700; font-size:15px; color:#fff;">
          <span class="team-badge" style="background:${teamAColor}"></span>${m.teamA?.name || 'Team A'} vs
          <span class="team-badge" style="background:${teamBColor}"></span>${m.teamB?.name || 'Team B'}
        </div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
          Status: <span style="color:#3b82f6; font-weight:600;">${m.status || 'LIVE'}</span> | Overs: ${overStr} / ${m.oversPerInnings || 20}
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="font-size:22px; font-weight:900; color:#fff; cursor:pointer;" onclick="selectMatch('${m.id}')">
          ${m.totalRuns || 0}/${m.totalWickets || 0}
        </div>
        <button class="btn" style="background:#7f1d1d; color:#fca5a5; padding:6px 10px; font-size:12px; border-radius:8px;" onclick="handleDeleteMatch('${m.id}', event)">
          🗑️ Delete
        </button>
      </div>
    `;
    listEl.appendChild(item);
  });
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

async function getAllTeamsList() {
  const globalTeams = await window.CricStorage.listTeams();
  let tourneyTeams = [];
  if (activeTournament && activeTournament.teams) {
    tourneyTeams = activeTournament.teams;
  }
  const map = new Map();
  [...globalTeams, ...tourneyTeams].forEach(t => {
    if (t && t.id) map.set(t.id, t);
  });
  return Array.from(map.values());
}

// ------------------- IN-MEMORY SQUAD BUILDER ENGINE -------------------

function renderSquadList(side) {
  const container = document.getElementById(side === 'A' ? 'teamASquadList' : 'teamBSquadList');
  const squad = side === 'A' ? matchSquadA : matchSquadB;

  if (!container) return;
  container.innerHTML = '';

  if (!squad || squad.length === 0) {
    container.innerHTML = `<div class="squad-empty">No players added yet</div>`;
    return;
  }

  squad.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'squad-row';

    row.innerHTML = `
      <div class="squad-row-name">
        <span>${idx + 1}. ${p.name}</span>
        ${p.isCaptain ? '<span class="badge-c">(C)</span>' : ''}
        ${p.isViceCaptain ? '<span class="badge-vc">(VC)</span>' : ''}
      </div>
      <div class="squad-btn-group">
        <button class="role-btn ${p.isCaptain ? 'active-c' : ''}" onclick="setSquadRole('${side}', ${idx}, 'C')">C</button>
        <button class="role-btn ${p.isViceCaptain ? 'active-vc' : ''}" onclick="setSquadRole('${side}', ${idx}, 'VC')">VC</button>
        <button class="role-btn" style="background:#334155; color:#f8fafc;" title="Move to Team ${side === 'A' ? 'B' : 'A'}" onclick="movePlayerToOtherSquad('${side}', ${idx})">⇄ Move</button>
        <button class="squad-remove" onclick="removeFromSquad('${side}', ${idx})">✕</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function setSquadRole(side, idx, role) {
  const squad = side === 'A' ? matchSquadA : matchSquadB;
  const target = squad[idx];
  if (!target) return;

  if (role === 'C') {
    const isAlreadyC = target.isCaptain;
    squad.forEach(p => p.isCaptain = false);
    target.isCaptain = !isAlreadyC;
    if (target.isCaptain) target.isViceCaptain = false;
  } else if (role === 'VC') {
    const isAlreadyVC = target.isViceCaptain;
    squad.forEach(p => p.isViceCaptain = false);
    target.isViceCaptain = !isAlreadyVC;
    if (target.isViceCaptain) target.isCaptain = false;
  }

  renderSquadList(side);
}

function removeFromSquad(side, idx) {
  if (side === 'A') {
    matchSquadA.splice(idx, 1);
  } else {
    matchSquadB.splice(idx, 1);
  }
  renderSquadList(side);
  refreshPlayerPickOptions();
}

function movePlayerToOtherSquad(side, idx) {
  const fromSquad = side === 'A' ? matchSquadA : matchSquadB;
  const toSquad = side === 'A' ? matchSquadB : matchSquadA;

  const toTeamName = document.getElementById(side === 'A' ? 'teamBName' : 'teamAName').value.trim() || `Team ${side === 'A' ? 'B' : 'A'}`;

  const player = fromSquad[idx];
  if (!player) return;

  fromSquad.splice(idx, 1);

  toSquad.push({
    id: player.id,
    name: player.name,
    isCaptain: toSquad.length === 0,
    isViceCaptain: toSquad.length === 1
  });

  renderSquadList('A');
  renderSquadList('B');
  refreshPlayerPickOptions();
  showToast(`Moved "${player.name}" to ${toTeamName}`, 'info');
}

function clearSquad(side) {
  const teamName = document.getElementById(side === 'A' ? 'teamAName' : 'teamBName').value.trim() || `Team ${side}`;
  if (side === 'A') {
    matchSquadA = [];
  } else {
    matchSquadB = [];
  }
  renderSquadList('A');
  renderSquadList('B');
  refreshPlayerPickOptions();
  showToast(`Cleared ${teamName} squad`, 'info');
}

function addTypedPlayerToSquad(side) {
  const inputEl = document.getElementById(side === 'A' ? 'newPlayerInputA' : 'newPlayerInputB');
  if (!inputEl || !inputEl.value) return;

  const rawName = inputEl.value.trim();
  if (!rawName) return;

  const thisSquad = side === 'A' ? matchSquadA : matchSquadB;
  const otherSquad = side === 'A' ? matchSquadB : matchSquadA;

  const thisTeamName = document.getElementById(side === 'A' ? 'teamAName' : 'teamBName').value.trim() || `Team ${side}`;
  const otherTeamName = document.getElementById(side === 'A' ? 'teamBName' : 'teamAName').value.trim() || `Team ${side === 'A' ? 'B' : 'A'}`;

  // 1. Same-Squad Check
  if (thisSquad.some(p => p.name.toLowerCase() === rawName.toLowerCase())) {
    showToast(`"${rawName}" is already in this squad`, 'warning');
    return;
  }

  // 2. Cross-Squad Check (Move Prompt)
  const existingInOther = otherSquad.find(p => p.name.toLowerCase() === rawName.toLowerCase());
  if (existingInOther) {
    if (confirm(`"${rawName}" is already in ${otherTeamName}. Move to ${thisTeamName}?`)) {
      if (side === 'A') {
        matchSquadB = matchSquadB.filter(p => p.id !== existingInOther.id);
        renderSquadList('B');
      } else {
        matchSquadA = matchSquadA.filter(p => p.id !== existingInOther.id);
        renderSquadList('A');
      }
    } else {
      return; // User cancelled
    }
  }

  thisSquad.push({
    id: existingInOther ? existingInOther.id : `p_${side.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: rawName,
    isCaptain: thisSquad.length === 0,
    isViceCaptain: thisSquad.length === 1
  });

  inputEl.value = '';
  renderSquadList(side);
  refreshPlayerPickOptions();
}

function addPickedPlayerToSquad(side) {
  const selectEl = document.getElementById(side === 'A' ? 'selectGlobalPlayerA' : 'selectGlobalPlayerB');
  if (!selectEl || !selectEl.value) return;

  try {
    const pObj = JSON.parse(selectEl.value);
    const thisSquad = side === 'A' ? matchSquadA : matchSquadB;
    const otherSquad = side === 'A' ? matchSquadB : matchSquadA;

    const thisTeamName = document.getElementById(side === 'A' ? 'teamAName' : 'teamBName').value.trim() || `Team ${side}`;
    const otherTeamName = document.getElementById(side === 'A' ? 'teamBName' : 'teamAName').value.trim() || `Team ${side === 'A' ? 'B' : 'A'}`;

    // 1. Same-Squad Check
    if (thisSquad.some(p => p.id === pObj.id || p.name.toLowerCase() === pObj.name.toLowerCase())) {
      showToast(`"${pObj.name}" is already in this squad`, 'warning');
      return;
    }

    // 2. Cross-Squad Check (Move Prompt)
    const existingInOther = otherSquad.find(p => p.id === pObj.id || p.name.toLowerCase() === pObj.name.toLowerCase());
    if (existingInOther) {
      if (confirm(`"${pObj.name}" is already in ${otherTeamName}. Move to ${thisTeamName}?`)) {
        if (side === 'A') {
          matchSquadB = matchSquadB.filter(p => p.id !== existingInOther.id);
          renderSquadList('B');
        } else {
          matchSquadA = matchSquadA.filter(p => p.id !== existingInOther.id);
          renderSquadList('A');
        }
      } else {
        return; // User cancelled
      }
    }

    thisSquad.push({
      id: pObj.id || `p_${side.toLowerCase()}_${Date.now()}`,
      name: pObj.name,
      isCaptain: thisSquad.length === 0,
      isViceCaptain: thisSquad.length === 1
    });

    selectEl.value = '';
    renderSquadList(side);
    refreshPlayerPickOptions();
  } catch (e) {
    console.warn('Error adding picked player:', e);
  }
}

function onAddGlobalPlayer(side) { addPickedPlayerToSquad(side); }
function onAddNewPlayerInput(side) { addTypedPlayerToSquad(side); }

async function refreshPlayerPickOptions() {
  const globalPlayers = await window.CricStorage.listGlobalPlayers();
  const selA = document.getElementById('selectGlobalPlayerA');
  const selB = document.getElementById('selectGlobalPlayerB');

  if (!selA || !selB) return;

  selA.innerHTML = '<option value="">-- Choose Existing Player --</option>';
  selB.innerHTML = '<option value="">-- Choose Existing Player --</option>';

  const squadAMap = new Map(matchSquadA.map(p => [p.name.toLowerCase(), p]));
  const squadBMap = new Map(matchSquadB.map(p => [p.name.toLowerCase(), p]));

  const teamAName = document.getElementById('teamAName').value.trim() || 'Team A';
  const teamBName = document.getElementById('teamBName').value.trim() || 'Team B';

  globalPlayers.forEach(p => {
    let statusLabel = 'Unassigned';
    if (squadAMap.has(p.name.toLowerCase())) {
      statusLabel = `In ${teamAName}`;
    } else if (squadBMap.has(p.name.toLowerCase())) {
      statusLabel = `In ${teamBName}`;
    }

    const optA = document.createElement('option');
    optA.value = JSON.stringify(p);
    optA.innerText = `${p.name} (${p.role || 'Batter'}) • [${statusLabel}]`;
    selA.appendChild(optA);

    const optB = document.createElement('option');
    optB.value = JSON.stringify(p);
    optB.innerText = `${p.name} (${p.role || 'Batter'}) • [${statusLabel}]`;
    selB.appendChild(optB);
  });
}

function loadTeamIntoSquad(side, team) {
  if (!team) return;
  if (side === 'A') {
    document.getElementById('teamAName').value = team.name || '';
    document.getElementById('teamAColor').value = team.colorHex || '#FF5722';
    matchSquadA = (team.players || []).map((p, idx) => ({
      id: p.id || `pa_${Date.now()}_${idx}`,
      name: typeof p === 'string' ? p : p.name,
      isCaptain: Boolean(p.isCaptain || idx === 0),
      isViceCaptain: Boolean(p.isViceCaptain || idx === 1)
    }));
    renderSquadList('A');
  } else {
    document.getElementById('teamBName').value = team.name || '';
    document.getElementById('teamBColor').value = team.colorHex || '#2196F3';
    matchSquadB = (team.players || []).map((p, idx) => ({
      id: p.id || `pb_${Date.now()}_${idx}`,
      name: typeof p === 'string' ? p : p.name,
      isCaptain: Boolean(p.isCaptain || idx === 0),
      isViceCaptain: Boolean(p.isViceCaptain || idx === 1)
    }));
    renderSquadList('B');
  }
  refreshPlayerPickOptions();
}

async function showNewMatchScreen() {
  showScreen('screenNewMatch');

  matchSquadA = [];
  matchSquadB = [];

  document.getElementById('teamAName').value = '';
  document.getElementById('teamBName').value = '';

  const teams = await getAllTeamsList();
  const selectA = document.getElementById('selectTeamA');
  const selectB = document.getElementById('selectTeamB');

  selectA.innerHTML = '<option value="">-- Custom Team A --</option>';
  selectB.innerHTML = '<option value="">-- Custom Team B --</option>';

  teams.forEach(t => {
    const pCount = (t.players || []).length;
    const optA = document.createElement('option');
    optA.value = t.id;
    optA.innerText = `${t.name} (${pCount} player${pCount !== 1 ? 's' : ''})`;
    selectA.appendChild(optA);

    const optB = document.createElement('option');
    optB.value = t.id;
    optB.innerText = `${t.name} (${pCount} player${pCount !== 1 ? 's' : ''})`;
    selectB.appendChild(optB);
  });

  renderSquadList('A');
  renderSquadList('B');
  await refreshPlayerPickOptions();
}

async function onSelectTeamAChange() {
  const teamId = document.getElementById('selectTeamA').value;
  if (!teamId) return;

  const teams = await getAllTeamsList();
  const found = teams.find(t => t.id === teamId);
  if (found) {
    loadTeamIntoSquad('A', found);
  }
}

async function onSelectTeamBChange() {
  const teamId = document.getElementById('selectTeamB').value;
  if (!teamId) return;

  const teams = await getAllTeamsList();
  const found = teams.find(t => t.id === teamId);
  if (found) {
    loadTeamIntoSquad('B', found);
  }
}

async function handleCreateMatch() {
  const teamAName = document.getElementById('teamAName').value.trim() || 'Team A';
  const teamAColor = document.getElementById('teamAColor').value || '#FF5722';

  const teamBName = document.getElementById('teamBName').value.trim() || 'Team B';
  const teamBColor = document.getElementById('teamBColor').value || '#2196F3';

  if (matchSquadA.length < 1) {
    showToast('Please add at least 1 player to Team A squad', 'warning');
    return;
  }
  if (matchSquadB.length < 1) {
    showToast('Please add at least 1 player to Team B squad', 'warning');
    return;
  }

  const overs = parseInt(document.getElementById('matchOvers').value) || 5;
  const maxBowlerOvers = parseInt(document.getElementById('maxBowlerOvers').value) || 2;
  const saveForReuse = document.getElementById('saveTeamsForReuse').checked;

  const teamACaptain = matchSquadA.find(p => p.isCaptain)?.id || matchSquadA[0]?.id;
  const teamAViceCaptain = matchSquadA.find(p => p.isViceCaptain)?.id || (matchSquadA[1] ? matchSquadA[1].id : null);

  const teamBCaptain = matchSquadB.find(p => p.isCaptain)?.id || matchSquadB[0]?.id;
  const teamBViceCaptain = matchSquadB.find(p => p.isViceCaptain)?.id || (matchSquadB[1] ? matchSquadB[1].id : null);

  const teamA = {
    id: 'team_a_' + Date.now(),
    name: teamAName,
    colorHex: teamAColor,
    players: matchSquadA.map(p => ({
      id: p.id,
      name: p.name,
      isCaptain: p.id === teamACaptain,
      isViceCaptain: p.id === teamAViceCaptain,
      battingStats: { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, isRetiredHurt: false, wicketType: 'NONE' },
      bowlingStats: { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0, dotBalls: 0, wides: 0, noBalls: 0 }
    }))
  };

  const teamB = {
    id: 'team_b_' + Date.now(),
    name: teamBName,
    colorHex: teamBColor,
    players: matchSquadB.map(p => ({
      id: p.id,
      name: p.name,
      isCaptain: p.id === teamBCaptain,
      isViceCaptain: p.id === teamBViceCaptain,
      battingStats: { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, isRetiredHurt: false, wicketType: 'NONE' },
      bowlingStats: { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0, dotBalls: 0, wides: 0, noBalls: 0 }
    }))
  };

  if (saveForReuse) {
    await window.CricStorage.saveTeam(teamA);
    await window.CricStorage.saveTeam(teamB);

    for (const p of teamA.players) {
      await window.CricStorage.addGlobalPlayer({ id: p.id, name: p.name, role: 'Batter' });
    }
    for (const p of teamB.players) {
      await window.CricStorage.addGlobalPlayer({ id: p.id, name: p.name, role: 'Batter' });
    }
  }

  activeMatch = {
    id: 'match_' + Date.now(),
    tournamentId: activeTournament?.id || null,
    teamA,
    teamB,
    teamACaptainId: teamACaptain,
    teamAViceCaptainId: teamAViceCaptain,
    teamBCaptainId: teamBCaptain,
    teamBViceCaptainId: teamBViceCaptain,
    status: 'UPCOMING',
    currentInnings: 1,
    battingTeamId: teamA.id,
    bowlingTeamId: teamB.id,
    totalRuns: 0,
    totalWickets: 0,
    totalBalls: 0,
    oversPerInnings: overs,
    maxOversPerBowler: maxBowlerOvers,
    ballHistory: [],
    wicketHistory: [],
    gullyRules: {
      noExtraRunsForWidesNoBalls: false,
      lastManStanding: false,
      unequalTeams: false
    }
  };

  openTossModal();
}

function openTossModal() {
  if (!activeMatch) return;
  const btnA = document.getElementById('tossBtnTeamA');
  const btnB = document.getElementById('tossBtnTeamB');

  btnA.innerText = activeMatch.teamA.name;
  btnB.innerText = activeMatch.teamB.name;

  selectedTossWinnerId = activeMatch.teamA.id;
  selectedTossDecision = 'BAT';

  document.getElementById('tossResultText').innerText = '';
  document.getElementById('coinImg').src = 'img/coin_heads.png';

  updateTossButtonsUI();
  document.getElementById('tossModal').classList.add('active');
}

function closeTossModal() {
  document.getElementById('tossModal').classList.remove('active');
}

function spinCoinFlip() {
  const coinImg = document.getElementById('coinImg');
  const resultText = document.getElementById('tossResultText');

  coinImg.classList.add('spinning');
  resultText.innerText = 'Flipping coin... 🪙';

  setTimeout(() => {
    const isHeads = Math.random() < 0.5;
    coinImg.classList.remove('spinning');

    if (isHeads) {
      coinImg.src = 'img/coin_heads.png';
      selectedTossWinnerId = activeMatch.teamA.id;
      resultText.innerText = `🪙 Result: HEADS! (${activeMatch.teamA.name} won the toss)`;
    } else {
      coinImg.src = 'img/coin_tails.png';
      selectedTossWinnerId = activeMatch.teamB.id;
      resultText.innerText = `🪙 Result: TAILS! (${activeMatch.teamB.name} won the toss)`;
    }

    updateTossButtonsUI();
  }, 1200);
}

function selectTossWinner(teamKey) {
  if (!activeMatch) return;
  selectedTossWinnerId = teamKey === 'teamA' ? activeMatch.teamA.id : activeMatch.teamB.id;
  updateTossButtonsUI();
}

function selectTossDecision(decision) {
  selectedTossDecision = decision;
  updateTossButtonsUI();
}

function updateTossButtonsUI() {
  if (!activeMatch) return;
  const btnA = document.getElementById('tossBtnTeamA');
  const btnB = document.getElementById('tossBtnTeamB');
  const btnBat = document.getElementById('tossBtnBat');
  const btnBowl = document.getElementById('tossBtnBowl');

  btnA.style.background = selectedTossWinnerId === activeMatch.teamA.id ? 'var(--primary-color)' : '#1e293b';
  btnB.style.background = selectedTossWinnerId === activeMatch.teamB.id ? 'var(--primary-color)' : '#1e293b';

  btnBat.style.background = selectedTossDecision === 'BAT' ? 'var(--accent-color)' : '#1e293b';
  btnBowl.style.background = selectedTossDecision === 'BOWL' ? 'var(--accent-color)' : '#1e293b';
}

async function confirmTossAndStart() {
  if (!activeMatch) return;

  activeMatch.tossWinnerId = selectedTossWinnerId;
  activeMatch.tossDecision = selectedTossDecision;
  activeMatch.status = 'LIVE';

  const teamABats = (selectedTossWinnerId === activeMatch.teamA.id && selectedTossDecision === 'BAT') ||
                    (selectedTossWinnerId === activeMatch.teamB.id && selectedTossDecision === 'BOWL');

  activeMatch.battingTeamId = teamABats ? activeMatch.teamA.id : activeMatch.teamB.id;
  activeMatch.bowlingTeamId = teamABats ? activeMatch.teamB.id : activeMatch.teamA.id;
  activeMatch.initialBattingTeamId = activeMatch.battingTeamId;
  activeMatch.initialBowlingTeamId = activeMatch.bowlingTeamId;

  const batTeam = teamABats ? activeMatch.teamA : activeMatch.teamB;
  const bowlTeam = teamABats ? activeMatch.teamB : activeMatch.teamA;

  activeMatch.strikerId = batTeam.players[0]?.id;
  activeMatch.nonStrikerId = batTeam.players[1]?.id;
  activeMatch.currentBowlerId = bowlTeam.players[0]?.id;

  document.getElementById('tossModal').classList.remove('active');
  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  await window.CricStorage.createMatch(activeMatch);

  showLiveScreen();
}

function openMatchSettingsModal() {
  if (!activeMatch) return;
  document.getElementById('editOversText').value = activeMatch.oversPerInnings || 5;
  document.getElementById('editMaxBowlerOvers').value = activeMatch.maxOversPerBowler || 2;

  const rules = activeMatch.gullyRules || {};
  document.getElementById('ruleNoExtras').checked = rules.noExtraRunsForWidesNoBalls || false;
  document.getElementById('ruleLMS').checked = rules.lastManStanding || false;
  document.getElementById('ruleUnequal').checked = rules.unequalTeams || false;

  const selectA = document.getElementById('editTeamAWK');
  const selectB = document.getElementById('editTeamBWK');

  if (selectA) {
    selectA.innerHTML = '<option value="">-- Select WK A --</option>';
    (activeMatch.teamA?.players || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = p.name;
      if (p.id === activeMatch.teamAWicketKeeperId) opt.selected = true;
      selectA.appendChild(opt);
    });
  }

  if (selectB) {
    selectB.innerHTML = '<option value="">-- Select WK B --</option>';
    (activeMatch.teamB?.players || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = p.name;
      if (p.id === activeMatch.teamBWicketKeeperId) opt.selected = true;
      selectB.appendChild(opt);
    });
  }

  document.getElementById('matchSettingsModal').classList.add('active');
}

function closeMatchSettingsModal() {
  document.getElementById('matchSettingsModal').classList.remove('active');
}

async function saveMatchSettings() {
  if (!activeMatch) return;
  const overs = parseInt(document.getElementById('editOversText').value) || 5;
  const maxBowlerOvers = parseInt(document.getElementById('editMaxBowlerOvers').value) || 2;

  activeMatch.oversPerInnings = overs;
  activeMatch.maxOversPerBowler = maxBowlerOvers;

  const selectA = document.getElementById('editTeamAWK');
  const selectB = document.getElementById('editTeamBWK');
  if (selectA) activeMatch.teamAWicketKeeperId = selectA.value || null;
  if (selectB) activeMatch.teamBWicketKeeperId = selectB.value || null;

  activeMatch.gullyRules = {
    noExtraRunsForWidesNoBalls: document.getElementById('ruleNoExtras').checked,
    lastManStanding: document.getElementById('ruleLMS').checked,
    unequalTeams: document.getElementById('ruleUnequal').checked
  };

  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  await window.CricStorage.saveMatch(activeMatch);

  closeMatchSettingsModal();
  renderLiveScoring();
}

async function wipeAllAppData() {
  if (confirm("Are you sure you want to wipe all local app data?")) {
    await window.CricStorage.resetAllData();
    activeMatch = null;
    activeTournament = null;
    location.reload();
  }
}

async function selectMatch(matchId) {
  try {
    activeMatch = await window.CricStorage.getMatch(matchId);
    if (!activeMatch) {
      if (isReadOnlySpectator) {
        showToast('Match not found', 'danger');
        showLandingScreen();
      } else {
        loadMatchListScreen();
      }
      return;
    }

    activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
    showLiveScreen();
  } catch (err) {
    console.error('Failed to select match:', err);
    if (isReadOnlySpectator) {
      showLandingScreen();
    } else {
      loadMatchListScreen();
    }
  }
}

function isCaptainPlayer(p, teamId, match) {
  if (p.isCaptain) return true;
  if (teamId === match.teamA?.id && p.id === match.teamACaptainId) return true;
  if (teamId === match.teamB?.id && p.id === match.teamBCaptainId) return true;
  return false;
}

function isViceCaptainPlayer(p, teamId, match) {
  if (p.isViceCaptain) return true;
  if (teamId === match.teamA?.id && p.id === match.teamAViceCaptainId) return true;
  if (teamId === match.teamB?.id && p.id === match.teamBViceCaptainId) return true;
  return false;
}

function renderLiveScoring() {
  if (!activeMatch) {
    loadMatchListScreen();
    return;
  }

  const m = activeMatch;
  const isBattingA = m.battingTeamId === m.teamA?.id;
  const battingTeam = isBattingA ? m.teamA : m.teamB;
  const bowlingTeam = isBattingA ? m.teamB : m.teamA;

  const teamAColor = m.teamA?.colorHex || '#FF5722';
  const teamBColor = m.teamB?.colorHex || '#2196F3';
  const battingTeamColor = battingTeam?.colorHex || (isBattingA ? teamAColor : teamBColor);
  const bowlingTeamColor = bowlingTeam?.colorHex || (isBattingA ? teamBColor : teamAColor);

  // Score Card Accent Border
  const scoreCardEl = document.getElementById('mainScoreCard');
  if (scoreCardEl) {
    scoreCardEl.style.borderTop = `4px solid ${battingTeamColor}`;
  }

  // Spectator Banner & Keypad / Action Controls Hiding
  const spectatorBanner = document.getElementById('spectatorBanner');
  const scoringKeypad = document.getElementById('scoringKeypad');
  const goLiveBtn = document.getElementById('goLiveBtn');
  const btnSwapBatsmen = document.getElementById('btnSwapBatsmen');

  if (isReadOnlySpectator) {
    if (spectatorBanner) spectatorBanner.style.display = 'block';
    if (scoringKeypad) scoringKeypad.style.display = 'none';
    if (goLiveBtn) goLiveBtn.style.display = 'none';
    if (btnSwapBatsmen) btnSwapBatsmen.style.display = 'none';
  } else {
    if (spectatorBanner) spectatorBanner.style.display = 'none';
    if (scoringKeypad) scoringKeypad.style.display = 'grid';
    if (goLiveBtn) goLiveBtn.style.display = 'block';
    if (btnSwapBatsmen) btnSwapBatsmen.style.display = 'flex';
  }

  // Last Saved Tag
  const lastSavedTag = document.getElementById('lastSavedTag');
  if (lastSavedTag) {
    const timeStr = m.updatedAt ? new Date(m.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
    lastSavedTag.innerText = `Saved ${timeStr}`;
  }

  // Completed Match Summary Card
  const completedCard = document.getElementById('completedMatchCard');
  if (m.status === 'COMPLETED') {
    completedCard.style.display = 'block';
    const resultStr = window.ScoringEngine.getMatchResultString(m);

    // Calculate Man of the Match
    const motm = window.ScoringEngine.calculateMotm(m);
    const motmHtml = motm ? `<div style="font-size:13px; color:#fde047; font-weight:800; margin-top:8px;">🌟 MAN OF THE MATCH: ${motm.player.name.toUpperCase()} (Impact: ${motm.impactScore} pts)</div>` : '';

    document.getElementById('winnerTitle').innerText = resultStr;
    document.getElementById('marginText').innerHTML = `Match Completed | ${m.currentInnings === 2 ? 'Target Reached / Innings Ended' : 'Innings Completed'}${motmHtml}`;
  } else {
    completedCard.style.display = 'none';
  }

  // Header Match Info & Team Accents
  const tossWinner = m.tossWinnerId === m.teamA?.id ? m.teamA?.name : (m.tossWinnerId === m.teamB?.id ? m.teamB?.name : null);
  const tossStr = tossWinner ? ` · ${tossWinner} opt to ${m.tossDecision?.toLowerCase()}` : '';

  const scoringHeader = document.getElementById('scoringHeader');
  if (scoringHeader) {
    scoringHeader.innerHTML = `
      <div style="margin-bottom:8px;">
        <span style="background:${battingTeamColor}; color:#fff; font-size:11px; font-weight:800; padding:3px 10px; border-radius:12px; display:inline-block; letter-spacing:0.5px; box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏏 ${battingTeam?.name?.toUpperCase() || ''} BATTING</span>
      </div>
      <div style="font-size:16px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;">
        <span style="color:${teamAColor}; border-bottom:2px solid ${teamAColor}; padding-bottom:1px; display:inline-flex; align-items:center; gap:4px;">
          <span class="team-badge" style="background:${teamAColor};"></span>${m.teamA?.name || 'Team A'}
        </span>
        <span style="color:var(--text-muted); font-size:12px;">vs</span>
        <span style="color:${teamBColor}; border-bottom:2px solid ${teamBColor}; padding-bottom:1px; display:inline-flex; align-items:center; gap:4px;">
          <span class="team-badge" style="background:${teamBColor};"></span>${m.teamB?.name || 'Team B'}
        </span>
      </div>
      <div style="font-size:12px; color:var(--text-muted); font-weight:600; margin-top:6px;">
        Batting: <span style="color:${battingTeamColor}; font-weight:800;">${battingTeam?.name || ''}</span>${tossStr}
      </div>
    `;
  }

  // Score Main Accent
  const scoreMainEl = document.getElementById('scoreMain');
  if (scoreMainEl) {
    scoreMainEl.innerText = `${m.totalRuns || 0}/${m.totalWickets || 0}`;
    scoreMainEl.style.color = battingTeamColor;
  }

  const overStr = `${Math.floor((m.totalBalls || 0) / 6)}.${(m.totalBalls || 0) % 6}`;
  document.getElementById('oversText').innerText = `Overs: ${overStr} / ${m.oversPerInnings || 20}`;

  // CRR & RRR
  const totalOversDec = (m.totalBalls || 0) / 6;
  const crr = totalOversDec > 0 ? ((m.totalRuns || 0) / totalOversDec).toFixed(2) : '0.00';
  document.getElementById('crrText').innerText = `CRR: ${crr}`;

  const targetBanner = document.getElementById('targetBanner');
  if (m.currentInnings === 2 && m.target) {
    const remRuns = m.target - m.totalRuns;
    const remBalls = (m.oversPerInnings * 6) - m.totalBalls;
    const rrr = remBalls > 0 && remRuns > 0 ? ((remRuns / remBalls) * 6).toFixed(2) : '0.00';
    targetBanner.style.display = 'block';
    targetBanner.innerText = `Target: ${m.target} (Need ${remRuns} runs in ${remBalls} balls)`;
    document.getElementById('rrrText').innerText = `RRR: ${rrr}`;
  } else {
    targetBanner.style.display = 'none';
    document.getElementById('rrrText').innerText = `RRR: -`;
  }

  // Recent Balls Chips
  const recentContainer = document.getElementById('recentBalls');
  recentContainer.innerHTML = '';
  const history = m.ballHistory || [];
  const recent = history.slice(-8);

  recent.forEach(b => {
    const div = document.createElement('div');
    div.className = 'ball-chip';

    if (b.isAdjustment && b.adjustmentSlot === 'SWAP') {
      div.classList.add('extra');
      div.innerText = '🔀';
    } else if (b.wicketType && b.wicketType !== 'NONE') {
      div.classList.add('wicket');
      div.innerText = b.wicketType === 'RETIRED_HURT' ? 'RET' : 'W';
    } else if (b.isDroppedCatch || b.wasDroppedCatch) {
      div.classList.add('extra');
      div.innerText = `🤲${b.runs || 0}`;
    } else if (b.runs === 4) {
      div.classList.add('four');
      div.innerText = '4';
    } else if (b.runs === 6) {
      div.classList.add('six');
      div.innerText = '6';
    } else if (b.runs === 1 && b.rotateStrike === false) {
      div.innerText = '1G';
    } else if (b.extrasType === 'GRANTED') {
      div.classList.add('extra');
      div.innerText = '1G';
    } else if (b.extrasType === 'WIDE') {
      div.classList.add('extra');
      div.innerText = `${b.extraRuns || 1}WD`;
    } else if (b.extrasType === 'NO_BALL') {
      div.classList.add('extra');
      const total = (b.runs || 0) + (b.extraRuns || 1);
      div.innerText = total > 1 ? `${total}NB` : 'NB';
    } else if (b.extrasType === 'BYE') {
      div.classList.add('extra');
      div.innerText = `${b.extraRuns || 1}B`;
    } else if (b.extrasType === 'LEG_BYE') {
      div.classList.add('extra');
      div.innerText = `${b.extraRuns || 1}LB`;
    } else {
      div.innerText = b.runs || 0;
    }
    recentContainer.appendChild(div);
  });

  // Batting Card Title Accent
  const battingTitleEl = document.getElementById('battingCardTitle');
  if (battingTitleEl) {
    battingTitleEl.style.color = battingTeamColor;
    battingTitleEl.style.borderLeft = `4px solid ${battingTeamColor}`;
    battingTitleEl.style.paddingLeft = '8px';
    battingTitleEl.innerText = `${battingTeam?.name || ''} Batting`;
  }

  // Batters Table
  const battersBody = document.getElementById('battersTable');
  battersBody.innerHTML = '';

  const striker = (battingTeam?.players || []).find(p => p.id === m.strikerId);
  const nonStriker = (battingTeam?.players || []).find(p => p.id === m.nonStrikerId);

  [
    { player: striker, isStriker: true, role: 'STRIKER' },
    { player: nonStriker, isStriker: false, role: 'NON_STRIKER' }
  ].forEach(({ player: p, isStriker, role }) => {
    const tr = document.createElement('tr');
    if (isStriker) {
      const rgb = hexToRgb(battingTeamColor);
      tr.style.background = `rgba(${rgb}, 0.12)`;
      tr.style.borderLeft = `3px solid ${battingTeamColor}`;
    }

    if (p) {
      const stats = p.battingStats || { runs: 0, balls: 0, fours: 0, sixes: 0 };
      const sr = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(1) : '0.0';

      const isC = isCaptainPlayer(p, battingTeam.id, m);
      const isVC = isViceCaptainPlayer(p, battingTeam.id, m);

      const editBtn = isReadOnlySpectator ? '' : `
        <button class="edit-player-btn" onclick="openPlayerSelection('${role}')" title="Change ${isStriker ? 'Striker' : 'Non-Striker'}">✏️</button>
      `;

      tr.innerHTML = `
        <td style="font-weight:700; color:#fff;">
          <div style="display:flex; align-items:center; gap:2px;">
            <span>${p.name}</span>
            ${isC ? '<span class="badge-c">(C)</span>' : ''}
            ${isVC ? '<span class="badge-vc">(VC)</span>' : ''}
            ${isStriker ? '<span class="striker-star">★</span>' : ''}
            ${editBtn}
          </div>
        </td>
        <td style="text-align:right"><b>${stats.runs}</b></td>
        <td style="text-align:right">${stats.balls}</td>
        <td style="text-align:right">${stats.fours}</td>
        <td style="text-align:right">${stats.sixes}</td>
        <td style="text-align:right">${sr}</td>
      `;
    } else {
      const selectBtn = isReadOnlySpectator ? '' : `
        <button class="btn-primary" style="width:auto; padding:2px 8px; font-size:11px;" onclick="openPlayerSelection('${role}')">Select ${isStriker ? 'Striker' : 'Non-Striker'}</button>
      `;
      tr.innerHTML = `
        <td colspan="6" style="padding:8px; text-align:left;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span style="color:var(--text-muted); font-size:12px;">No ${isStriker ? 'Striker' : 'Non-Striker'} selected</span>
            ${selectBtn}
          </div>
        </td>
      `;
    }
    battersBody.appendChild(tr);
  });

  // Bowling Card Title
  const bowlingTitleEl = document.getElementById('bowlingCardTitle');
  if (bowlingTitleEl) {
    bowlingTitleEl.innerText = `Bowling — ${bowlingTeam?.name || ''}`;
  }

  // Bowler Table
  const bowlerBody = document.getElementById('bowlerTable');
  bowlerBody.innerHTML = '';
  const bowler = (bowlingTeam?.players || []).find(p => p.id === m.currentBowlerId);
  if (bowler) {
    const tr = document.createElement('tr');
    const stats = bowler.bowlingStats || { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0 };
    const totalOversDec = stats.overs + (stats.balls / 6);
    const eco = totalOversDec > 0 ? (stats.runsConceded / totalOversDec).toFixed(2) : '0.00';

    const isC = isCaptainPlayer(bowler, bowlingTeam.id, m);
    const isVC = isViceCaptainPlayer(bowler, bowlingTeam.id, m);

    const editBtn = isReadOnlySpectator ? '' : `
      <button class="edit-player-btn" onclick="openPlayerSelection('BOWLER')" title="Change Bowler">✏️</button>
    `;

    tr.innerHTML = `
      <td style="font-weight:700; color:#fff;">
        <div style="display:flex; align-items:center; gap:2px;">
          <span>${bowler.name}</span>
          ${isC ? '<span class="badge-c">(C)</span>' : ''}
          ${isVC ? '<span class="badge-vc">(VC)</span>' : ''}
          ${editBtn}
        </div>
      </td>
      <td style="text-align:right">${stats.overs}.${stats.balls}</td>
      <td style="text-align:right">${stats.maidens}</td>
      <td style="text-align:right">${stats.runsConceded}</td>
      <td style="text-align:right"><b>${stats.wickets}</b></td>
      <td style="text-align:right">${eco}</td>
    `;
    bowlerBody.appendChild(tr);
  } else {
    const editBtn = isReadOnlySpectator ? '' : `
      <button class="btn-primary" style="width:auto; padding:2px 8px; font-size:11px;" onclick="openPlayerSelection('BOWLER')">Select Bowler</button>
    `;
    bowlerBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:10px;">Select Bowler ${editBtn}</td></tr>`;
  }

  // Action Prompt Banner
  const actionBanner = document.getElementById('actionBanner');
  if (m.pendingAction && m.pendingAction !== 'NONE' && !isReadOnlySpectator) {
    actionBanner.style.display = 'block';
    actionBanner.innerText = `Pending Action: ${m.pendingAction.replace(/_/g, ' ')}`;
    promptPendingAction(m.pendingAction);
  } else {
    actionBanner.style.display = 'none';
  }
}

function formatRemainingOvers(stats, maxOvers) {
  if (!maxOvers || maxOvers <= 0) return null;
  const bowledBalls = (stats.overs || 0) * 6 + (stats.balls || 0);
  const maxBalls = maxOvers * 6;
  const remBalls = Math.max(0, maxBalls - bowledBalls);
  const remOvers = Math.floor(remBalls / 6);
  const remExtraBalls = remBalls % 6;
  return `${remOvers}.${remExtraBalls}`;
}

async function startSecondInnings() {
  if (!activeMatch || isReadOnlySpectator) return;
  activeMatch.isSecondInningsStarted = true;
  activeMatch.pendingAction = 'SELECT_STRIKER';
  activeMatch.strikerId = null;
  activeMatch.nonStrikerId = null;
  activeMatch.currentBowlerId = null;
  activeMatch.lastBowlerId = null;

  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  await window.CricStorage.saveMatch(activeMatch);
  showToast('Innings 2 Started! Please select 2nd Innings Striker', 'info');
  renderLiveScoring();
}

function promptPendingAction(action) {
  if (action === 'START_SECOND_INNINGS') {
    startSecondInnings();
  } else if (action === 'SELECT_STRIKER' || action === 'REPLACE_STRIKER') {
    openPlayerSelection('STRIKER');
  } else if (action === 'SELECT_NON_STRIKER' || action === 'REPLACE_NON_STRIKER') {
    openPlayerSelection('NON_STRIKER');
  } else if (action === 'SELECT_BOWLER' || action === 'REPLACE_BOWLER') {
    openPlayerSelection('BOWLER');
  } else if (action === 'SELECT_FIELDER_DROPPED_CATCH') {
    openDroppedCatchModal();
  } else if (action === 'SELECT_RUNS_DROPPED_CATCH') {
    if (pendingDropFielderId) document.getElementById('droppedCatchRunsModal').classList.add('active');
    else openDroppedCatchModal();
  } else if (action === 'SELECT_FIELDER') {
    if (pendingFielderWicketType) openFielderModal(pendingFielderWicketType);
    else openWicketModal();
  } else if (action === 'SELECT_RUNS_WICKET') {
    openRunOutModal();
  } else if (action === 'TOSS_REQUIRED') {
    openTossModal();
  }
}

function closeSelectionModal() {
  document.getElementById('selectionModal').classList.remove('active');
}

function openPlayerSelection(type) {
  if (isReadOnlySpectator) return;
  currentSelectionType = type;
  const m = activeMatch;
  if (!m) return;

  const isBattingA = m.battingTeamId === m.teamA?.id;
  const battingTeam = isBattingA ? m.teamA : m.teamB;
  const bowlingTeam = isBattingA ? m.teamB : m.teamA;

  const modal = document.getElementById('selectionModal');
  const title = document.getElementById('selectionTitle');
  const bowlerContainer = document.getElementById('bowlerListContainer');
  const dropdownGroup = document.getElementById('genericDropdownGroup');
  const confirmBtn = document.getElementById('btnConfirmGenericSelection');

  bowlerContainer.innerHTML = '';

  if (type === 'BOWLER') {
    title.innerText = 'Select Bowler';
    dropdownGroup.style.display = 'none';
    confirmBtn.style.display = 'none';

    (bowlingTeam?.players || []).forEach(p => {
      const isLastBowler = p.id === m.lastBowlerId;
      const isCurrent = p.id === m.currentBowlerId;
      const stats = p.bowlingStats || { overs: 0, balls: 0, runsConceded: 0, wickets: 0 };
      const maxOvers = m.maxOversPerBowler || 0;
      const maxReached = maxOvers > 0 && stats.overs >= maxOvers;
      const isDisabled = isLastBowler || maxReached;

      const item = document.createElement('div');
      item.className = `bowler-option ${isDisabled ? 'disabled' : ''}`;
      if (!isDisabled) {
        item.onclick = () => selectBowlerDirect(p.id);
      } else {
        item.onclick = () => {
          if (maxReached) {
            showToast(`${p.name} has completed maximum quota (${maxOvers} overs)`, 'warning');
          } else if (isLastBowler) {
            showToast(`${p.name} bowled the previous over`, 'warning');
          }
        };
      }

      let tag = '';
      if (isCurrent) tag = '<span style="font-size:10px; color:#60a5fa; margin-left:4px;">(Current)</span>';
      else if (isLastBowler) tag = '<span style="font-size:10px; color:#fca5a5; margin-left:4px;">(Last Bowler)</span>';
      else if (maxReached) tag = '<span style="font-size:10px; color:#fca5a5; margin-left:4px;">(Quota Completed)</span>';
      else if (maxReached) tag = '<span style="font-size:10px; color:#fca5a5; margin-left:4px;">(Max Overs)</span>';

      item.innerHTML = `
        <div>
          <div style="font-weight:700; color:#fff; display:flex; align-items:center;">${p.name} ${tag}</div>
          <div style="font-size:11px; color:var(--text-muted);">${stats.overs}.${stats.balls} Ov | ${stats.runsConceded} Runs | ${stats.wickets} Wkts</div>
        </div>
        <button class="btn-primary" style="width:auto; padding:6px 12px; font-size:12px;" ${isDisabled ? 'disabled' : ''}>Select</button>
      `;
      bowlerContainer.appendChild(item);
    });

  } else {
    title.innerText = `Select ${type === 'STRIKER' ? 'Striker' : 'Non-Striker'}`;
    dropdownGroup.style.display = 'block';
    confirmBtn.style.display = 'block';

    const select = document.getElementById('selectionDropdown');
    select.innerHTML = '';

    const otherId = type === 'STRIKER' ? m.nonStrikerId : m.strikerId;
    const currentId = type === 'STRIKER' ? m.strikerId : m.nonStrikerId;

    const available = (battingTeam?.players || []).filter(p => {
      if (!p) return false;
      if (p.id === otherId) return false;
      if (p.battingStats?.isOut) return false;
      if (p.battingStats?.isRetiredHurt) return false;
      return true;
    });

    if (available.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.innerText = 'No available batters';
      select.appendChild(opt);
      confirmBtn.disabled = true;
    } else {
      confirmBtn.disabled = false;
      available.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        const isCurrent = p.id === currentId;
        const runs = p.battingStats?.runs || 0;
        const balls = p.battingStats?.balls || 0;
        opt.innerText = `${p.name} (${runs} runs, ${balls}b)${isCurrent ? ' [Current]' : ''}`;
        if (isCurrent) opt.selected = true;
        select.appendChild(opt);
      });
    }
  }

  modal.classList.add('active');
}

function ensureScoringPlayersSelected() {
  if (!activeMatch || isReadOnlySpectator) return false;

  if (activeMatch.pendingAction && activeMatch.pendingAction !== 'NONE') {
    showToast('Action required: ' + activeMatch.pendingAction.replace(/_/g, ' '), 'warning');
    promptPendingAction(activeMatch.pendingAction);
    return false;
  }

  if (!activeMatch.strikerId) {
    showToast('Please select Striker first', 'warning');
    openPlayerSelection('STRIKER');
    return false;
  }
  const isBattingA = activeMatch.battingTeamId === activeMatch.teamA?.id;
  const battingTeam = isBattingA ? activeMatch.teamA : activeMatch.teamB;
  const squadSize = (battingTeam?.players || []).length;
  const needsNonStriker = activeMatch.gullyRules?.lastManStanding
    ? activeMatch.totalWickets < squadSize - 1
    : true;
  if (needsNonStriker && !activeMatch.nonStrikerId) {
    showToast('Please select Non-Striker first', 'warning');
    openPlayerSelection('NON_STRIKER');
    return false;
  }
  if (!activeMatch.currentBowlerId) {
    showToast('Please select Bowler first', 'warning');
    openPlayerSelection('BOWLER');
    return false;
  }
  return true;
}

async function selectBowlerDirect(bowlerId) {
  if (!activeMatch || isReadOnlySpectator) return;
  const adjustmentBall = {
    isAdjustment: true,
    adjustmentSlot: 'BOWLER',
    isReplacement: true,
    adjustmentPlayerId: bowlerId,
    isLegalBall: false,
    runs: 0,
    extrasType: "NONE",
    wicketType: "NONE"
  };

  activeMatch.currentBowlerId = bowlerId;
  closeSelectionModal();
  activeMatch = await window.CricStorage.addBall(activeMatch.id, adjustmentBall);
  renderLiveScoring();
}

async function confirmPlayerSelection() {
  const select = document.getElementById('selectionDropdown');
  const selectedId = select.value;
  if (!selectedId || !activeMatch || isReadOnlySpectator) return;

  const slot = currentSelectionType;
  const adjustmentBall = {
    isAdjustment: true,
    adjustmentSlot: slot,
    isReplacement: true,
    adjustmentPlayerId: selectedId,
    isLegalBall: false,
    runs: 0,
    extrasType: "NONE",
    wicketType: "NONE"
  };

  if (slot === 'STRIKER') activeMatch.strikerId = selectedId;
  else if (slot === 'NON_STRIKER') activeMatch.nonStrikerId = selectedId;

  closeSelectionModal();
  activeMatch = await window.CricStorage.addBall(activeMatch.id, adjustmentBall);
  renderLiveScoring();
}

async function addBall(runs) {
  if (!ensureScoringPlayersSelected()) return;
  const ball = {
    runs,
    extrasType: 'NONE',
    extraRuns: 0,
    wicketType: 'NONE',
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  const prevBalls = activeMatch.totalBalls || 0;
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);

  const newBalls = activeMatch.totalBalls || 0;
  if (newBalls > 0 && newBalls % 6 === 0 && newBalls !== prevBalls) {
    checkAndShowOverEndModal();
  }

  renderLiveScoring();
}

async function addExtra(type) {
  if (type === 'WIDE') {
    if (!ensureScoringPlayersSelected()) return;
    const ball = {
      runs: 0,
      extrasType: 'WIDE',
      extraRuns: 1,
      isLegalBall: false,
      wicketType: 'NONE',
      strikerId: activeMatch.strikerId,
      nonStrikerId: activeMatch.nonStrikerId,
      bowlerId: activeMatch.currentBowlerId
    };

    activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
    renderLiveScoring();
  } else {
    openExtraRunsModal(type);
  }
}

let pendingExtraType = null;

function openExtraRunsModal(type) {
  if (!ensureScoringPlayersSelected()) return;
  pendingExtraType = type;

  const titleEl = document.getElementById('extraRunsTitle');
  const subEl = document.getElementById('extraRunsSubtitle');
  const container = document.getElementById('extraRunsOptionsContainer');

  container.innerHTML = '';

  if (type === 'NO_BALL') {
    titleEl.innerText = '⚠️ NO-BALL + Runs';
    subEl.innerText = 'Select additional runs scored off the bat:';

    const options = [
      { runs: 0, label: '0 Runs (1NB)' },
      { runs: 1, label: '1 Run (2NB)' },
      { runs: 2, label: '2 Runs (3NB)' },
      { runs: 3, label: '3 Runs (4NB)' },
      { runs: 4, label: '4 Runs (5NB)' },
      { runs: 6, label: '6 Runs (7NB)' }
    ];

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-run';
      btn.style.fontSize = '12px';
      btn.style.padding = '12px 6px';
      btn.innerText = opt.label;
      btn.onclick = () => submitNoBallWithRuns(opt.runs);
      container.appendChild(btn);
    });

  } else if (type === 'BYE' || type === 'LEG_BYE') {
    titleEl.innerText = type === 'BYE' ? '⚾ BYES' : '🦵 LEG BYES';
    subEl.innerText = `Select number of ${type === 'BYE' ? 'byes' : 'leg byes'}:`;

    const options = [
      { extraRuns: 1, label: '1 Run' },
      { extraRuns: 2, label: '2 Runs' },
      { extraRuns: 3, label: '3 Runs' },
      { extraRuns: 4, label: '4 Runs' }
    ];

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-extra';
      btn.style.fontSize = '13px';
      btn.style.padding = '12px 6px';
      btn.innerText = opt.label;
      btn.onclick = () => submitByesWithRuns(type, opt.extraRuns);
      container.appendChild(btn);
    });
  }

  document.getElementById('extraRunsModal').classList.add('active');
}

function closeExtraRunsModal() {
  document.getElementById('extraRunsModal').classList.remove('active');
}

async function submitNoBallWithRuns(batRuns) {
  if (!activeMatch || isReadOnlySpectator) return;

  const ball = {
    runs: batRuns,
    extrasType: 'NO_BALL',
    extraRuns: 1,
    isLegalBall: false,
    wicketType: 'NONE',
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  closeExtraRunsModal();
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  renderLiveScoring();
}

async function submitByesWithRuns(type, extraRuns) {
  if (!activeMatch || isReadOnlySpectator) return;

  const ball = {
    runs: 0,
    extrasType: type,
    extraRuns: extraRuns,
    isLegalBall: true,
    wicketType: 'NONE',
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  closeExtraRunsModal();
  const prevBalls = activeMatch.totalBalls || 0;
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);

  const newBalls = activeMatch.totalBalls || 0;
  if (newBalls > 0 && newBalls % 6 === 0 && newBalls !== prevBalls) {
    checkAndShowOverEndModal();
  }

  renderLiveScoring();
}

async function handleRetireBatter() {
  if (!ensureScoringPlayersSelected()) return;
  const striker = activeMatch.strikerId;
  if (!striker) {
    showToast('No active striker to retire', 'warning');
    return;
  }
  if (confirm('Retire current striker? (Retired Hurt)')) {
    const ball = {
      runs: 0,
      extrasType: 'NONE',
      extraRuns: 0,
      wicketType: 'RETIRED_HURT',
      isLegalBall: false,
      strikerId: activeMatch.strikerId,
      nonStrikerId: activeMatch.nonStrikerId,
      bowlerId: activeMatch.currentBowlerId
    };
    activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
    showToast('Batter retired hurt', 'info');
    renderLiveScoring();
  }
}

function openOtherRunsModal() {
  if (!ensureScoringPlayersSelected()) return;
  const customInput = document.getElementById('customOtherRunsInput');
  if (customInput) customInput.value = '';
  document.getElementById('otherRunsModal').classList.add('active');
}

function closeOtherRunsModal() {
  document.getElementById('otherRunsModal').classList.remove('active');
}

async function submitOtherRuns(runs) {
  if (!activeMatch || isReadOnlySpectator) return;
  closeOtherRunsModal();
  await addBall(runs);
}

async function submitCustomOtherRuns() {
  const input = document.getElementById('customOtherRunsInput');
  const runs = parseInt(input.value);
  if (isNaN(runs) || runs < 0) {
    showToast('Please enter a valid number of runs', 'warning');
    return;
  }
  closeOtherRunsModal();
  await addBall(runs);
}

let pendingDropFielderId = null;

function openDroppedCatchModal() {
  if (!ensureScoringPlayersSelected()) return;

  const isBattingA = activeMatch.battingTeamId === activeMatch.teamA?.id;
  const bowlingTeam = isBattingA ? activeMatch.teamB : activeMatch.teamA;

  const fielderSelect = document.getElementById('dropFielderSelect');
  if (fielderSelect) {
    fielderSelect.innerHTML = '';
    (bowlingTeam?.players || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = p.name;
      fielderSelect.appendChild(opt);
    });
  }

  document.getElementById('droppedCatchFielderModal').classList.add('active');
}

function closeDroppedCatchFielderModal() {
  document.getElementById('droppedCatchFielderModal').classList.remove('active');
  pendingDropFielderId = null;
}

function proceedToDroppedCatchRuns() {
  const fielderSelect = document.getElementById('dropFielderSelect');
  const fielderId = fielderSelect ? fielderSelect.value : null;
  if (!fielderId) {
    showToast('Please select a fielder', 'warning');
    return;
  }
  pendingDropFielderId = fielderId;
  closeDroppedCatchFielderModal();
  document.getElementById('droppedCatchRunsModal').classList.add('active');
}

function closeDroppedCatchRunsModal() {
  document.getElementById('droppedCatchRunsModal').classList.remove('active');
  pendingDropFielderId = null;
}

async function submitDroppedCatchWithRuns(runs) {
  if (!pendingDropFielderId || !activeMatch || isReadOnlySpectator) return;

  const ball = {
    runs: runs,
    extrasType: 'NONE',
    extraRuns: 0,
    wicketType: 'NONE',
    isDroppedCatch: true,
    wasDroppedCatch: true,
    fielderId: pendingDropFielderId,
    isLegalBall: true,
    rotateStrike: true,
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  const fielder = (activeMatch.teamA?.players.concat(activeMatch.teamB?.players || [])).find(p => p.id === pendingDropFielderId);
  const fielderName = fielder ? fielder.name : 'Fielder';

  closeDroppedCatchRunsModal();

  const prevBalls = activeMatch.totalBalls || 0;
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);

  const newBalls = activeMatch.totalBalls || 0;
  if (newBalls > 0 && newBalls % 6 === 0 && newBalls !== prevBalls) {
    checkAndShowOverEndModal();
  }

  showToast(`Dropped catch by ${fielderName} recorded (${runs} run${runs !== 1 ? 's' : ''})`, 'info');
  renderLiveScoring();
}
}

async function submitDroppedCatch() {
  const fielderSelect = document.getElementById('dropFielderSelect');
  const runsSelect = document.getElementById('dropRunsSelect');

  const fielderId = fielderSelect.value;
  const runs = parseInt(runsSelect.value) || 0;

  if (!fielderId || !activeMatch || isReadOnlySpectator) return;

  const ball = {
    runs: runs,
    extrasType: 'NONE',
    extraRuns: 0,
    wicketType: 'NONE',
    isDroppedCatch: true,
    wasDroppedCatch: true,
    fielderId: fielderId,
    isLegalBall: true,
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  closeDroppedCatchModal();
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  showToast('Dropped catch recorded', 'info');
  renderLiveScoring();
}

async function addGrantedRun() {
  if (!ensureScoringPlayersSelected()) return;
  const ball = {
    runs: 1,
    extrasType: "NONE",
    extraRuns: 0,
    isLegalBall: true,
    rotateStrike: false,
    wicketType: "NONE",
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  const prevBalls = activeMatch.totalBalls || 0;
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);

  const newBalls = activeMatch.totalBalls || 0;
  if (newBalls > 0 && newBalls % 6 === 0 && newBalls !== prevBalls) {
    checkAndShowOverEndModal();
  }

  renderLiveScoring();
}

async function swapBatsmen() {
  if (!activeMatch || isReadOnlySpectator) return;
  const ball = {
    isAdjustment: true,
    adjustmentSlot: "SWAP",
    isLegalBall: false,
    runs: 0,
    extrasType: "NONE",
    wicketType: "NONE"
  };

  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  renderLiveScoring();
}

function checkAndShowOverEndModal() {
  if (!activeMatch) return;
  const summaries = window.ScoringEngine.getOverSummaries(activeMatch);
  if (summaries.length === 0) return;

  const lastOver = summaries[summaries.length - 1];
  const isBattingA = activeMatch.battingTeamId === activeMatch.teamA?.id;
  const bowlingTeam = isBattingA ? activeMatch.teamB : activeMatch.teamA;
  const lastBowler = (bowlingTeam?.players || []).find(p => p.id === activeMatch.lastBowlerId);

  document.getElementById('overEndTitle').innerText = `End of Over ${lastOver.overNumber}`;
  document.getElementById('overEndBody').innerText = `Runs in Over: ${lastOver.runs} | Wickets: ${lastOver.wickets}`;

  if (lastBowler) {
    const stats = lastBowler.bowlingStats || { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0 };
    document.getElementById('overEndBowlerStats').innerText = `${lastBowler.name}: ${stats.overs}.${stats.balls} Ov - ${stats.runsConceded} Runs - ${stats.wickets} Wkts`;
  }

  document.getElementById('overEndModal').classList.add('active');
}

function closeOverEndModal() {
  document.getElementById('overEndModal').classList.remove('active');
}

function openWicketModal() {
  if (isReadOnlySpectator) return;
  document.getElementById('wicketModal').classList.add('active');
}

let pendingFielderWicketType = null;

function openWicketModal() {
  if (!ensureScoringPlayersSelected()) return;
  document.getElementById('wicketModal').classList.add('active');
}

function closeWicketModal() {
  document.getElementById('wicketModal').classList.remove('active');
}

async function submitWicket() {
  if (!activeMatch || isReadOnlySpectator) return;
  const type = document.getElementById('wicketTypeSelect').value;

  if (type === 'RETIRED_HURT') {
    closeWicketModal();
    handleRetireBatter();
    return;
  }

  if (type === 'CAUGHT' || type === 'STUMPED') {
    closeWicketModal();
    openFielderModal(type);
    return;
  }

  if (type === 'RUN_OUT') {
    closeWicketModal();
    openRunOutModal();
    return;
  }

  const ball = {
    runs: 0,
    extrasType: 'NONE',
    extraRuns: 0,
    wicketType: type,
    outPlayerId: activeMatch.strikerId,
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  closeWicketModal();
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  renderLiveScoring();
}

function openFielderModal(wicketType) {
  if (!activeMatch || isReadOnlySpectator) return;
  pendingFielderWicketType = wicketType;

  const isBattingA = activeMatch.battingTeamId === activeMatch.teamA?.id;
  const bowlingTeam = isBattingA ? activeMatch.teamB : activeMatch.teamA;

  const titleEl = document.getElementById('fielderModalTitle');
  if (titleEl) {
    titleEl.innerText = `Select Fielder (${wicketType === 'CAUGHT' ? 'Catch' : 'Stumping'})`;
  }

  const select = document.getElementById('fielderSelect');
  select.innerHTML = '';

  (bowlingTeam?.players || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.innerText = p.name;
    select.appendChild(opt);
  });

  document.getElementById('fielderModal').classList.add('active');
}

function closeFielderModal() {
  document.getElementById('fielderModal').classList.remove('active');
}

async function confirmFielderWicket() {
  const select = document.getElementById('fielderSelect');
  const fielderId = select.value;
  if (!fielderId || !activeMatch || isReadOnlySpectator || !pendingFielderWicketType) return;

  const ball = {
    runs: 0,
    extrasType: 'NONE',
    extraRuns: 0,
    wicketType: pendingFielderWicketType,
    fielderId: fielderId,
    outPlayerId: activeMatch.strikerId,
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  closeFielderModal();
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  renderLiveScoring();
}

function openRunOutModal() {
  if (!activeMatch || isReadOnlySpectator) return;

  const isBattingA = activeMatch.battingTeamId === activeMatch.teamA?.id;
  const battingTeam = isBattingA ? activeMatch.teamA : activeMatch.teamB;
  const bowlingTeam = isBattingA ? activeMatch.teamB : activeMatch.teamA;

  const striker = (battingTeam?.players || []).find(p => p.id === activeMatch.strikerId);
  const nonStriker = (battingTeam?.players || []).find(p => p.id === activeMatch.nonStrikerId);

  const batterSelect = document.getElementById('runOutBatterSelect');
  batterSelect.innerHTML = '';

  if (striker) {
    const opt = document.createElement('option');
    opt.value = striker.id;
    opt.innerText = `${striker.name} (Striker)`;
    batterSelect.appendChild(opt);
  }
  if (nonStriker) {
    const opt = document.createElement('option');
    opt.value = nonStriker.id;
    opt.innerText = `${nonStriker.name} (Non-Striker)`;
    batterSelect.appendChild(opt);
  }

  const fielderSelect = document.getElementById('runOutFielderSelect');
  fielderSelect.innerHTML = '';
  (bowlingTeam?.players || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.innerText = p.name;
    fielderSelect.appendChild(opt);
  });

  document.getElementById('runOutModal').classList.add('active');
}

function closeRunOutModal() {
  document.getElementById('runOutModal').classList.remove('active');
}

async function confirmRunOutWicket() {
  const batterSelect = document.getElementById('runOutBatterSelect');
  const runsSelect = document.getElementById('runOutRunsSelect');
  const fielderSelect = document.getElementById('runOutFielderSelect');

  const outPlayerId = batterSelect.value;
  const runsCompleted = parseInt(runsSelect.value) || 0;
  const fielderId = fielderSelect.value;

  if (!outPlayerId || !fielderId || !activeMatch || isReadOnlySpectator) return;

  const ball = {
    runs: runsCompleted,
    extrasType: 'NONE',
    extraRuns: 0,
    wicketType: 'RUN_OUT',
    outPlayerId: outPlayerId,
    fielderId: fielderId,
    isLegalBall: true,
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  closeRunOutModal();
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  renderLiveScoring();
}

async function undoLastBall() {
  if (!activeMatch || isReadOnlySpectator) return;
  activeMatch = await window.CricStorage.undoBall(activeMatch.id);
  renderLiveScoring();
}

function formatDismissalText(s, bowlingTeam) {
  if (s.isRetiredHurt) return 'Retired Hurt';
  if (!s.isOut) return 'not out';

  const bowler = (bowlingTeam?.players || []).find(p => p.id === s.dismissalBowlerId);
  const fielder = (bowlingTeam?.players || []).find(p => p.id === s.dismissalFielderId);

  const bName = bowler ? bowler.name : '';
  const fName = fielder ? fielder.name : '';

  switch (s.wicketType) {
    case 'BOWLED':
      return bName ? `b ${bName}` : 'bowled';
    case 'CAUGHT':
      if (fName && bName) {
        return fName === bName ? `c & b ${bName}` : `c ${fName} b ${bName}`;
      }
      return fName ? `c ${fName}` : (bName ? `b ${bName}` : 'caught');
    case 'LBW':
      return bName ? `lbw b ${bName}` : 'lbw';
    case 'STUMPED':
      return fName && bName ? `st ${fName} b ${bName}` : 'stumped';
    case 'RUN_OUT':
      return fName ? `run out (${fName})` : 'run out';
    case 'HIT_WICKET':
      return bName ? `hit wicket b ${bName}` : 'hit wicket';
    default:
      return s.wicketType ? s.wicketType.toLowerCase().replace(/_/g, ' ') : 'out';
  }
}

function renderScorecard() {
  if (!activeMatch) return;
  const content = document.getElementById('scorecardContent');
  const m = activeMatch;
  const isBattingA = m.battingTeamId === m.teamA?.id;
  const battingTeam = isBattingA ? m.teamA : m.teamB;
  const bowlingTeam = isBattingA ? m.teamB : m.teamA;

  let batHtml = (battingTeam?.players || []).map(p => {
    const s = p.battingStats || { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, wicketType: 'NONE' };
    const sr = s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(1) : '0.0';
    const status = formatDismissalText(s, bowlingTeam);

    const isC = isCaptainPlayer(p, battingTeam.id, m);
    const isVC = isViceCaptainPlayer(p, battingTeam.id, m);

    return `
      <tr>
        <td style="font-weight:600; color:#fff;">
          ${p.name}
          ${isC ? '<span class="badge-c">(C)</span>' : ''}
          ${isVC ? '<span class="badge-vc">(VC)</span>' : ''}
          <br><span style="font-size:10px; color:var(--text-muted);">${status}</span>
        </td>
        <td style="text-align:right"><b>${s.runs}</b></td>
        <td style="text-align:right">${s.balls}</td>
        <td style="text-align:right">${s.fours}</td>
        <td style="text-align:right">${s.sixes}</td>
        <td style="text-align:right">${sr}</td>
      </tr>
    `;
  }).join('');

  let bowlHtml = (bowlingTeam?.players || []).map(p => {
    const s = p.bowlingStats || { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0 };
    const totalOversDec = s.overs + (s.balls / 6);
    const eco = totalOversDec > 0 ? (s.runsConceded / totalOversDec).toFixed(2) : '0.00';

    const isC = isCaptainPlayer(p, bowlingTeam.id, m);
    const isVC = isViceCaptainPlayer(p, bowlingTeam.id, m);

    return `
      <tr>
        <td style="font-weight:600; color:#fff;">
          ${p.name}
          ${isC ? '<span class="badge-c">(C)</span>' : ''}
          ${isVC ? '<span class="badge-vc">(VC)</span>' : ''}
        </td>
        <td style="text-align:right">${s.overs}.${s.balls}</td>
        <td style="text-align:right">${s.maidens}</td>
        <td style="text-align:right">${s.runsConceded}</td>
        <td style="text-align:right"><b>${s.wickets}</b></td>
        <td style="text-align:right">${eco}</td>
      </tr>
    `;
  }).join('');

  const history = m.wicketHistory || [];

  content.innerHTML = `
    <div style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">
      <b>Match Status:</b> <span style="color:#3b82f6;">${m.status || 'LIVE'}</span> | <b>Score:</b> ${m.totalRuns}/${m.totalWickets} (${Math.floor((m.totalBalls||0)/6)}.${(m.totalBalls||0)%6} Ov)
    </div>

    <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; margin-top:12px;">Batting (${battingTeam?.name})</h4>
    <table class="stats-table">
      <thead>
        <tr><th>Batter</th><th style="text-align:right">R</th><th style="text-align:right">B</th><th style="text-align:right">4s</th><th style="text-align:right">6s</th><th style="text-align:right">SR</th></tr>
      </thead>
      <tbody>${batHtml}</tbody>
    </table>

    <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; margin-top:16px;">Bowling (${bowlingTeam?.name})</h4>
    <table class="stats-table">
      <thead>
        <tr><th>Bowler</th><th style="text-align:right">O</th><th style="text-align:right">M</th><th style="text-align:right">R</th><th style="text-align:right">W</th><th style="text-align:right">ECO</th></tr>
      </thead>
      <tbody>${bowlHtml}</tbody>
    </table>

    <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; margin-top:16px;">Fall of Wickets</h4>
    <ul style="padding-left:18px; margin-top:6px; font-size:12px; line-height:1.6; color:var(--text-muted);">
      ${history.map(w => `<li><b>${w.wicketNumber}-${w.totalRuns}</b> (${w.batterName}, ${w.over} ov - ${w.wicketType})</li>`).join('') || '<li>No wickets yet</li>'}
    </ul>
  `;
}

// Overs Breakdown Timeline
function renderOvers() {
  if (!activeMatch) return;
  const container = document.getElementById('oversContainer');
  const summaries = window.ScoringEngine.getOverSummaries(activeMatch);
  container.innerHTML = '';

  if (summaries.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No overs completed yet.</div>';
    return;
  }

  summaries.slice().reverse().forEach(o => {
    const row = document.createElement('div');
    row.className = 'over-card-row';

    const chipsHtml = (o.balls || []).map(b => {
      let label = b.runs;
      let cls = 'ball-chip';
      if (b.isAdjustment && b.adjustmentSlot === 'SWAP') { label = '🔀'; cls += ' extra'; }
      else if (b.wicketType && b.wicketType !== 'NONE') { label = b.wicketType === 'RETIRED_HURT' ? 'RET' : 'W'; cls += ' wicket'; }
      else if (b.runs === 4) cls += ' four';
      else if (b.runs === 6) cls += ' six';
      else if (b.extrasType === 'GRANTED') { label = '1G'; cls += ' extra'; }
      else if (b.extrasType === 'WIDE') { label = `${b.extraRuns||1}WD`; cls += ' extra'; }
      else if (b.extrasType === 'NO_BALL') { label = `${b.runs+(b.extraRuns||1)}NB`; cls += ' extra'; }
      return `<div class="${cls}">${label}</div>`;
    }).join('');

    row.innerHTML = `
      <div>
        <div style="font-size:13px; font-weight:700; color:#fff;">Over ${o.overNumber} ${o.isPartial ? '(In Progress)' : ''}</div>
        <div style="display:flex; gap:4px; margin-top:6px;">${chipsHtml}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:16px; font-weight:800; color:var(--accent-color);">${o.runs} Runs</div>
        <div style="font-size:11px; color:var(--text-muted);">Total: ${o.teamTotalRuns}/${o.teamTotalWickets}</div>
      </div>
    `;
    container.appendChild(row);
  });
}

// Tournaments & Series Standings
async function renderTournaments() {
  const container = document.getElementById('tournamentsContainer');
  const tourneys = await window.CricStorage.listTournaments();
  const matches = await window.CricStorage.listMatches();

  container.innerHTML = '';

  if (!tourneys || tourneys.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No tournament series created yet. Click "+ New Series" above!</div>';
    return;
  }

  tourneys.forEach(t => {
    activeTournament = t;
    const card = document.createElement('div');
    card.className = 'card';

    const pointsTable = window.ScoringEngine.calculatePointsTable(t.teams || [], matches);
    const tableRows = pointsTable.map(p => `
      <tr>
        <td style="font-weight:700;"><span class="team-badge" style="background:${p.colorHex}"></span>${p.name}</td>
        <td style="text-align:right">${p.played}</td>
        <td style="text-align:right">${p.won}</td>
        <td style="text-align:right">${p.lost}</td>
        <td style="text-align:right"><b>${p.points}</b></td>
      </tr>
    `).join('');

    const teamsListHtml = (t.teams || []).map(tm => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:8px 12px; border-radius:8px; margin-top:6px;">
        <div style="font-weight:700; font-size:13px; color:#fff;">
          <span class="team-badge" style="background:${tm.colorHex||'#2196F3'}"></span>${tm.name} (${(tm.players||[]).length} Players)
        </div>
      </div>
    `).join('');

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h4 style="font-size:16px; font-weight:800; color:#fff;">🏆 ${t.name}</h4>
        <button class="btn" style="background:#7f1d1d; color:#fca5a5; padding:4px 8px; font-size:11px;" onclick="deleteSeries('${t.id}')">🗑️ Delete</button>
      </div>

      <!-- Sub-Tabs Bar for Tournament Details -->
      <div style="display:flex; gap:6px; background:#0f172a; padding:4px; border-radius:8px; margin-top:8px; margin-bottom:12px;">
        <button class="btn" style="flex:1; padding:6px; font-size:11px; background:${activeTourneySubTab==='TEAMS'?'var(--primary-color)':'transparent'}" onclick="setTourneySubTab('TEAMS')">TEAMS</button>
        <button class="btn" style="flex:1; padding:6px; font-size:11px; background:${activeTourneySubTab==='MATCHES'?'var(--primary-color)':'transparent'}" onclick="setTourneySubTab('MATCHES')">MATCHES</button>
        <button class="btn" style="flex:1; padding:6px; font-size:11px; background:${activeTourneySubTab==='TABLE'?'var(--primary-color)':'transparent'}" onclick="setTourneySubTab('TABLE')">TABLE</button>
      </div>

      ${activeTourneySubTab === 'TEAMS' ? `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Series Teams</div>
          <button class="btn-primary" style="width:auto; padding:4px 8px; font-size:11px;" onclick="openNewTeamModal()">+ Add Team</button>
        </div>
        <div style="margin-top:6px;">${teamsListHtml || '<div style="font-size:12px; color:var(--text-muted);">No teams in this series yet.</div>'}</div>
      ` : ''}

      ${activeTourneySubTab === 'MATCHES' ? `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Series Matches</div>
          <button class="btn-primary" style="width:auto; padding:4px 8px; font-size:11px;" onclick="showNewMatchScreen()">+ Start Match</button>
        </div>
      ` : ''}

      ${activeTourneySubTab === 'TABLE' ? `
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Points Table</div>
        <table class="stats-table">
          <thead>
            <tr><th>Team</th><th style="text-align:right">P</th><th style="text-align:right">W</th><th style="text-align:right">L</th><th style="text-align:right">PTS</th></tr>
          </thead>
          <tbody>${tableRows || '<tr><td colspan="5" style="text-align:center;">No completed matches</td></tr>'}</tbody>
        </table>
      ` : ''}
    `;
    container.appendChild(card);
  });
}

function setTourneySubTab(tab) {
  activeTourneySubTab = tab;
  renderTournaments();
}

function openNewTournamentModal() {
  document.getElementById('tournamentModal').classList.add('active');
}

function closeTournamentModal() {
  document.getElementById('tournamentModal').classList.remove('active');
}

async function handleCreateTournament() {
  const name = document.getElementById('tourneyName').value || 'Premier League 2025';
  const tourney = {
    id: 'tourney_' + Date.now(),
    name,
    teams: []
  };

  await window.CricStorage.saveTournament(tourney);
  closeTournamentModal();
  renderTournaments();
}

async function deleteSeries(id) {
  if (confirm("Are you sure you want to delete this tournament series?")) {
    await window.CricStorage.deleteTournament(id);
    renderTournaments();
  }
}

// Global Players & Teams Directory
async function renderPlayers() {
  const container = document.getElementById('playersContainer');
  const players = await window.CricStorage.listGlobalPlayers();
  container.innerHTML = '';

  if (!players || players.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No players in global roster. Click "+ Add Player" above!</div>';
    return;
  }

  players.forEach(p => {
    const item = document.createElement('div');
    item.className = 'over-card-row';

    item.innerHTML = `
      <div>
        <div style="font-size:14px; font-weight:700; color:#fff;">👤 ${p.name}</div>
        <div style="font-size:11px; color:var(--text-muted);">${p.role || 'Batter'} | ${p.style || 'RHB'}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn" style="background:#334155; padding:4px 8px; font-size:11px;" onclick="openEditPlayerModal('${p.id}', '${p.name}', '${p.role}', '${p.style}')">✏️ Edit</button>
        <button class="btn" style="background:#7f1d1d; color:#fca5a5; padding:4px 8px; font-size:11px;" onclick="deletePlayer('${p.id}')">🗑️ Delete</button>
      </div>
    `;
    container.appendChild(item);
  });
}

async function handleQuickAddPlayer() {
  const nameInput = document.getElementById('quickPlayerNameInput');
  const roleInput = document.getElementById('quickPlayerRoleInput');
  if (!nameInput) return;

  const rawName = nameInput.value.trim();
  if (!rawName) {
    showToast('Please enter a player name', 'warning');
    return;
  }

  const role = roleInput ? roleInput.value : 'Batter';
  const newPlayer = {
    id: 'gp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    name: rawName,
    role: role,
    style: 'RHB'
  };

  await window.CricStorage.addGlobalPlayer(newPlayer);
  nameInput.value = '';
  showToast(`Added "${rawName}" to player directory`, 'success');
  renderPlayers();
  await refreshPlayerPickOptions();
}

function openNewTeamModal() {
  document.getElementById('teamModal').classList.add('active');
}

function closeTeamModal() {
  document.getElementById('teamModal').classList.remove('active');
}

async function handleCreateTeam() {
  const name = document.getElementById('newTeamName').value;
  const color = document.getElementById('newTeamColor').value;
  const playersStr = document.getElementById('newTeamPlayers').value || 'Player 1, Player 2';
  if (!name) return;

  const newTeam = {
    id: 'team_' + Date.now(),
    name,
    colorHex: color,
    players: playersStr.split(',').map((pName, i) => ({
      id: `tp_${i}_${Date.now()}`,
      name: pName.trim(),
      role: 'Batter',
      style: 'RHB'
    }))
  };

  if (activeTournament) {
    activeTournament.teams = [...(activeTournament.teams || []), newTeam];
    await window.CricStorage.saveTournament(activeTournament);
  }

  await window.CricStorage.saveTeam(newTeam);

  for (const p of newTeam.players) {
    await window.CricStorage.addGlobalPlayer(p);
  }

  closeTeamModal();
  renderTournaments();
}

function openNewPlayerModal() {
  document.getElementById('editPlayerId').value = '';
  document.getElementById('newPlayerName').value = '';
  document.getElementById('playerModalTitle').innerText = 'Add Global Player';
  document.getElementById('playerModal').classList.add('active');
}

function openEditPlayerModal(id, name, role, style) {
  document.getElementById('editPlayerId').value = id;
  document.getElementById('newPlayerName').value = name;
  document.getElementById('newPlayerRole').value = role || 'Batter';
  document.getElementById('newPlayerStyle').value = style || 'RHB';
  document.getElementById('playerModalTitle').innerText = 'Edit Player Details';
  document.getElementById('playerModal').classList.add('active');
}

function closePlayerModal() {
  document.getElementById('playerModal').classList.remove('active');
}

async function handleSavePlayer() {
  const id = document.getElementById('editPlayerId').value;
  const nameInput = document.getElementById('newPlayerName');
  const roleSelect = document.getElementById('newPlayerRole');
  const styleSelect = document.getElementById('newPlayerStyle');

  const rawName = nameInput ? nameInput.value.trim() : '';
  if (!rawName) {
    showToast('Player name is required', 'warning');
    return;
  }

  const role = roleSelect ? roleSelect.value : 'Batter';
  const style = styleSelect ? styleSelect.value : 'RHB';

  await window.CricStorage.addGlobalPlayer({
    id: id || ('gp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
    name: rawName,
    role,
    style
  });

  closePlayerModal();
  showToast(`Saved player "${rawName}"`, 'success');
  renderPlayers();
  await refreshPlayerPickOptions();
}

async function deletePlayer(id) {
  if (confirm("Are you sure you want to delete this player from the global directory?")) {
    await window.CricStorage.deleteGlobalPlayer(id);
    showToast("Player deleted", "info");
    renderPlayers();
    await refreshPlayerPickOptions();
  }
}

// Stats & Leaderboards
async function renderStats() {
  const container = document.getElementById('statsContainer');
  const m = activeMatch;

  if (!m) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No match active. Select a match to view rich stats!</div>';
    return;
  }

  const teamA = m.teamA;
  const teamB = m.teamB;
  const splitIdx = m.innings1Data?.recordedBallsCount || (m.ballHistory || []).length;
  const i1Balls = (m.ballHistory || []).slice(0, splitIdx);
  const i2Balls = (m.ballHistory || []).slice(splitIdx);

  const i1Stats = window.ScoringEngine.calculateInningsStats(i1Balls);
  const i2Stats = window.ScoringEngine.calculateInningsStats(i2Balls);

  const i1Partnerships = window.ScoringEngine.calculatePartnerships(i1Balls, m);
  const i2Partnerships = window.ScoringEngine.calculatePartnerships(i2Balls, m);

  const motm = window.ScoringEngine.calculateMotm(m);
  const fc = window.ScoringEngine.calculateForecaster(m);

  const i1Name = m.initialBattingTeamId === teamA.id ? teamA.name : teamB.name;
  const i2Name = m.initialBattingTeamId === teamA.id ? teamB.name : teamA.name;

  const motmCardHtml = motm ? `
    <div class="card" style="background:linear-gradient(135deg, #1e1b4b 0%, #1a237e 100%); border-color:#ffd700; padding:16px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="font-size:36px;">🌟</div>
        <div>
          <div style="font-size:11px; color:#fde047; font-weight:800; text-transform:uppercase;">MAN OF THE MATCH • ICC RANKED</div>
          <div style="font-size:18px; font-weight:900; color:#fff;">${motm.player.name.toUpperCase()}</div>
          <div style="font-size:12px; color:#e2e8f0;">Impact Score: <span style="color:#ffd700; font-weight:800;">${motm.impactScore} pts</span></div>
        </div>
      </div>
    </div>
  ` : '';

  const forecasterCardHtml = `
    <div class="card" style="padding:16px;">
      <h4 style="font-size:13px; color:var(--primary-color); font-weight:900; text-transform:uppercase; margin-bottom:10px;">🔮 MATCH FORECASTER</h4>

      <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:800; margin-bottom:4px;">
        <span style="color:${teamA.colorHex||'#FF5722'}">${teamA.name.toUpperCase()} (${fc.teamAWin}%)</span>
        <span style="color:${teamB.colorHex||'#2196F3'}">${teamB.name.toUpperCase()} (${fc.teamBWin}%)</span>
      </div>

      <div style="height:10px; background:#0f172a; border-radius:6px; overflow:hidden; display:flex;">
        <div style="width:${fc.teamAWin}%; background:${teamA.colorHex||'#FF5722'}; transition:width 0.5s ease;"></div>
        <div style="width:${fc.teamBWin}%; background:${teamB.colorHex||'#2196F3'}; transition:width 0.5s ease;"></div>
      </div>

      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:10px; border-top:1px solid var(--card-border); padding-top:8px;">
        <span>Projected Current CRR: <b>${fc.projCurrent}</b></span>
        <span>At 10.0 RPO: <b>${fc.proj10}</b></span>
      </div>
    </div>
  `;

  container.innerHTML = `
    ${motmCardHtml}
    ${forecasterCardHtml}

    <!-- 1. Scoring Breakdown Card -->
    <div class="card" style="padding:16px;">
      <h4 style="font-size:13px; color:var(--primary-color); font-weight:900; text-transform:uppercase; margin-bottom:12px;">📊 SCORING BREAKDOWN</h4>

      <div style="display:flex; justify-content:space-between; font-weight:800; font-size:12px; color:var(--text-muted); margin-bottom:10px; border-bottom:1px solid var(--card-border); padding-bottom:6px;">
        <span>${i1Name.toUpperCase()}</span>
        <span>METRIC</span>
        <span>${i2Name.toUpperCase()}</span>
      </div>

      ${buildBreakdownRow("Powerplay (1-6 Ov)", `${i1Stats.ppRuns}/${i1Stats.ppWickets}`, `${i2Stats.ppRuns}/${i2Stats.ppWickets}`)}
      ${i1Stats.hasMid || i2Stats.hasMid ? buildBreakdownRow("Middle Overs (7-15 Ov)", `${i1Stats.midRuns}/${i1Stats.midWickets}`, `${i2Stats.midRuns}/${i2Stats.midWickets}`) : ''}
      ${i1Stats.hasFin || i2Stats.hasFin ? buildBreakdownRow("Death Overs (16-20 Ov)", `${i1Stats.finRuns}/${i1Stats.finWickets}`, `${i2Stats.finRuns}/${i2Stats.finWickets}`) : ''}

      <hr style="border-color:rgba(255,255,255,0.05); margin:8px 0;">

      ${buildBreakdownRow("Sixes", `${i1Stats.sixesRuns / 6}`, `${i2Stats.sixesRuns / 6}`)}
      ${buildBreakdownRow("Fours", `${i1Stats.foursRuns / 4}`, `${i2Stats.foursRuns / 4}`)}
      ${buildBreakdownRow("Singles", `${i1Stats.singlesRuns}`, `${i2Stats.singlesRuns}`)}
      ${buildBreakdownRow("Runs in Boundaries", `${i1Stats.boundaryRuns}`, `${i2Stats.boundaryRuns}`)}
      ${buildBreakdownRow("Dot Ball %", `${i1Stats.dotPercent}%`, `${i2Stats.dotPercent}%`)}
      ${buildBreakdownRow("Extras Runs", `${i1Stats.extrasRuns}`, `${i2Stats.extrasRuns}`)}
    </div>

    <!-- 2. Partnerships Section -->
    <div class="card" style="padding:16px;">
      <h4 style="font-size:13px; color:var(--primary-color); font-weight:900; text-transform:uppercase; margin-bottom:12px;">🏏 PARTNERSHIPS</h4>

      ${buildPartnershipsHtml(i1Name + " (1st Innings)", i1Partnerships)}
      ${m.currentInnings === 2 || i2Balls.length > 0 ? buildPartnershipsHtml(i2Name + " (2nd Innings)", i2Partnerships) : ''}
    </div>

    <!-- 3. Progress Interactive Line Chart Card -->
    <div class="card" style="padding:16px;">
      <h4 style="font-size:13px; color:var(--primary-color); font-weight:900; text-transform:uppercase; margin-bottom:12px;">📈 PROGRESS CHART</h4>
      <canvas id="progressChartCanvas" width="480" height="220" style="width:100%; height:220px; background:#0f172a; border-radius:8px;"></canvas>
    </div>

    <!-- 4. Over-by-Over Bar Chart Card -->
    <div class="card" style="padding:16px;">
      <h4 style="font-size:13px; color:var(--primary-color); font-weight:900; text-transform:uppercase; margin-bottom:12px;">📊 OVER BY OVER</h4>
      <canvas id="overByOverChartCanvas" width="480" height="220" style="width:100%; height:220px; background:#0f172a; border-radius:8px;"></canvas>
    </div>
  `;

  // Draw Interactive Canvas Charts
  setTimeout(() => {
    drawProgressCanvasChart(m, i1Balls, i2Balls, teamA.colorHex || '#FF5722', teamB.colorHex || '#2196F3');
    drawOverByOverCanvasChart(m, i1Balls, i2Balls, teamA.colorHex || '#FF5722', teamB.colorHex || '#2196F3');
  }, 50);
}

function buildBreakdownRow(label, v1, v2) {
  return `
    <div style="display:flex; justify-content:space-between; font-size:13px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.03);">
      <span style="font-weight:700; color:#fff; width:30%;">${v1}</span>
      <span style="color:var(--text-muted); text-align:center; width:40%; font-size:11px;">${label}</span>
      <span style="font-weight:700; color:#fff; text-align:right; width:30%;">${v2}</span>
    </div>
  `;
}

function buildPartnershipsHtml(title, partnerships) {
  if (!partnerships || partnerships.length === 0) return `<div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">No partnerships recorded for ${title}.</div>`;

  const rows = partnerships.map(p => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:8px; border-radius:8px; margin-bottom:6px; font-size:12px;">
      <div style="width:35%;">
        <div style="font-weight:700; color:#fff;">${p.batter1Name}</div>
        <div style="color:var(--text-muted); font-size:10px;">${p.batter1Runs} (${p.batter1Balls}b)</div>
      </div>
      <div style="text-align:center; background:#1e293b; padding:4px 10px; border-radius:6px;">
        <div style="font-size:14px; font-weight:900; color:var(--accent-color);">${p.totalRuns}</div>
        <div style="font-size:10px; color:var(--text-muted);">${p.totalBalls}b stand</div>
      </div>
      <div style="text-align:right; width:35%;">
        <div style="font-weight:700; color:#fff;">${p.batter2Name}</div>
        <div style="color:var(--text-muted); font-size:10px;">${p.batter2Runs} (${p.batter2Balls}b)</div>
      </div>
    </div>
  `).join('');

  return `
    <div style="font-size:11px; font-weight:800; color:var(--accent-color); text-transform:uppercase; margin-top:8px; margin-bottom:6px;">${title}</div>
    ${rows}
  `;
}

// Canvas Progress Line Chart Drawing
function drawProgressCanvasChart(match, i1Balls, i2Balls, color1, color2) {
  const canvas = document.getElementById('progressChartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const totalOvers = match.oversPerInnings || 5;
  const padL = 40, padR = 20, padT = 20, padB = 30;
  const w = canvas.width - padL - padR;
  const h = canvas.height - padT - padB;

  function buildPoints(balls) {
    const pts = [{ over: 0, runs: 0, isWicket: false }];
    let runs = 0, pBalls = 0;
    (balls || []).forEach(b => {
      if (b.isAdjustment) return;
      runs += (b.runs || 0) + (b.extraRuns || 0);
      const isW = b.wicketType && b.wicketType !== 'NONE' && b.wicketType !== 'RETIRED_HURT';
      if (window.ScoringEngine.isPhysicalBall(b)) pBalls++;
      pts.push({ over: pBalls / 6, runs, isWicket: isW });
    });
    return pts;
  }

  const p1 = buildPoints(i1Balls);
  const p2 = buildPoints(i2Balls);
  const maxRuns = Math.max(20, Math.max(...p1.map(p => p.runs), ...p2.map(p => p.runs)));

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 0.5;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px sans-serif';

  for (let i = 0; i <= 4; i++) {
    const yVal = Math.round((maxRuns * i) / 4);
    const yPx = padT + h - (yVal / maxRuns) * h;
    ctx.beginPath();
    ctx.moveTo(padL, yPx);
    ctx.lineTo(padL + w, yPx);
    ctx.stroke();
    ctx.fillText(yVal.toString(), 10, yPx + 3);
  }

  for (let o = 0; o <= totalOvers; o++) {
    const xPx = padL + (o / totalOvers) * w;
    ctx.beginPath();
    ctx.moveTo(xPx, padT);
    ctx.lineTo(xPx, padT + h);
    ctx.stroke();
    ctx.fillText(`${o}ov`, xPx - 8, canvas.height - 10);
  }

  function drawLine(pts, color) {
    if (!pts || pts.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const x = padL + (pt.over / totalOvers) * w;
      const y = padT + h - (pt.runs / maxRuns) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    pts.forEach(pt => {
      if (pt.isWicket) {
        const x = padL + (pt.over / totalOvers) * w;
        const y = padT + h - (pt.runs / maxRuns) * h;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  drawLine(p1, color1);
  if (match.currentInnings === 2 || i2Balls.length > 0) drawLine(p2, color2);
}

// Canvas Over-by-Over Bar Chart Drawing
function drawOverByOverCanvasChart(match, i1Balls, i2Balls, color1, color2) {
  const canvas = document.getElementById('overByOverChartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const totalOvers = match.oversPerInnings || 5;
  const padL = 40, padR = 20, padT = 20, padB = 30;
  const w = canvas.width - padL - padR;
  const h = canvas.height - padT - padB;

  function buildOvers(balls) {
    const overs = [];
    let curR = 0, curW = 0, pB = 0, idx = 1;
    (balls || []).forEach(b => {
      if (b.isAdjustment) return;
      curR += (b.runs || 0) + (b.extraRuns || 0);
      if (b.wicketType && b.wicketType !== 'NONE' && b.wicketType !== 'RETIRED_HURT') curW++;
      if (window.ScoringEngine.isPhysicalBall(b)) {
        pB++;
        if (pB === 6) {
          overs.push({ over: idx++, runs: curR, wickets: curW });
          pB = 0; curR = 0; curW = 0;
        }
      }
    });
    if (pB > 0) overs.push({ over: idx, runs: curR, wickets: curW });
    return overs;
  }

  const o1 = buildOvers(i1Balls);
  const o2 = buildOvers(i2Balls);
  const maxRuns = Math.max(12, Math.max(...o1.map(o => o.runs), ...o2.map(o => o.runs)));

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 0.5;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px sans-serif';

  for (let i = 0; i <= 3; i++) {
    const yVal = Math.round((maxRuns * i) / 3);
    const yPx = padT + h - (yVal / maxRuns) * h;
    ctx.beginPath(); ctx.moveTo(padL, yPx); ctx.lineTo(padL + w, yPx); ctx.stroke();
    ctx.fillText(yVal.toString(), 10, yPx + 3);
  }

  const segW = w / totalOvers;
  const barW = segW * 0.35;

  for (let idx = 0; idx < totalOvers; idx++) {
    const xBase = padL + idx * segW + segW * 0.1;
    ctx.fillText(`${idx + 1}`, xBase + barW, canvas.height - 10);

    const over1 = o1.find(x => x.over === idx + 1);
    if (over1 && over1.runs > 0) {
      const bH = (over1.runs / maxRuns) * h;
      ctx.fillStyle = color1;
      ctx.fillRect(xBase, padT + h - bH, barW, bH);

      if (over1.wickets > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(xBase + barW / 2, padT + h - bH - 6, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    const over2 = o2.find(x => x.over === idx + 1);
    if (over2 && over2.runs > 0) {
      const bH = (over2.runs / maxRuns) * h;
      ctx.fillStyle = color2;
      ctx.fillRect(xBase + barW + 2, padT + h - bH, barW, bH);

      if (over2.wickets > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(xBase + barW + 2 + barW / 2, padT + h - bH - 6, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', async () => {
  updateAuthUI();

  // Check URL query parameters for Spectator Live View Mode (?matchId=match_123)
  const urlParams = new URLSearchParams(window.location.search);
  const sharedMatchId = urlParams.get('matchId');

  if (sharedMatchId) {
    isReadOnlySpectator = true;
    selectMatch(sharedMatchId);

    // Auto-poll live score every 5 seconds for spectators
    spectatorPollInterval = setInterval(async () => {
      if (activeMatch && isReadOnlySpectator) {
        const fresh = await window.CricStorage.getMatch(activeMatch.id);
        if (fresh) {
          activeMatch = window.ScoringEngine.recalculateMatch(fresh);
          renderLiveScoring();
        }
      }
    }, 5000);

    return;
  }

  // Check user mode or existing session
  const userMode = localStorage.getItem('cric_user_mode');
  const user = window.CricStorage.getCurrentUser();

  if (user || userMode === 'GUEST' || userMode === 'REGISTERED') {
    const matches = await window.CricStorage.listMatches();
    if (matches && matches.length > 0) {
      selectMatch(matches[0].id);
    } else {
      loadMatchListScreen();
    }
  } else {
    showLandingScreen();
  }
});
