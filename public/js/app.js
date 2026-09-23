// App Controller for CricScore Pro Web PWA

let activeMatch = null;
let activeTournament = null;
let activeTourneySubTab = 'TEAMS'; // TEAMS, MATCHES, TABLE, STATS

let currentSelectionType = null; // STRIKER, NON_STRIKER, BOWLER
let selectedTossWinnerId = null;
let selectedTossDecision = 'BAT';

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

// Multi-Tab Persistence Sync
window.addEventListener('storage', (e) => {
  if (e.key === 'cric_matches' && activeMatch) {
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

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
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
    item.onclick = () => selectMatch(m.id);

    const teamAColor = m.teamA?.colorHex || '#FF5722';
    const teamBColor = m.teamB?.colorHex || '#2196F3';
    const overStr = `${Math.floor((m.totalBalls || 0) / 6)}.${(m.totalBalls || 0) % 6}`;

    item.innerHTML = `
      <div>
        <div style="font-weight:700; font-size:15px; color:#fff;">
          <span class="team-badge" style="background:${teamAColor}"></span>${m.teamA?.name || 'Team A'} vs
          <span class="team-badge" style="background:${teamBColor}"></span>${m.teamB?.name || 'Team B'}
        </div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
          Status: <span style="color:#3b82f6; font-weight:600;">${m.status || 'LIVE'}</span> | Overs: ${overStr} / ${m.oversPerInnings || 20}
        </div>
      </div>
      <div style="font-size:22px; font-weight:900; color:#fff;">
        ${m.totalRuns || 0}/${m.totalWickets || 0}
      </div>
    `;
    listEl.appendChild(item);
  });
}

async function showNewMatchScreen() {
  showScreen('screenNewMatch');

  // Populate Team Reuse Selector (Requirement 4)
  const teams = await window.CricStorage.listTeams();
  const selectA = document.getElementById('selectTeamA');
  const selectB = document.getElementById('selectTeamB');

  selectA.innerHTML = '<option value="">-- Custom Team A --</option>';
  selectB.innerHTML = '<option value="">-- Custom Team B --</option>';

  teams.forEach(t => {
    const optA = document.createElement('option');
    optA.value = t.id;
    optA.innerText = `${t.name} (${(t.players||[]).length} players)`;
    selectA.appendChild(optA);

    const optB = document.createElement('option');
    optB.value = t.id;
    optB.innerText = `${t.name} (${(t.players||[]).length} players)`;
    selectB.appendChild(optB);
  });
}

async function onSelectTeamAChange() {
  const teamId = document.getElementById('selectTeamA').value;
  if (!teamId) return;

  const teams = await window.CricStorage.listTeams();
  const found = teams.find(t => t.id === teamId);
  if (found) {
    document.getElementById('teamAName').value = found.name;
    document.getElementById('teamAColor').value = found.colorHex || '#FF5722';
    document.getElementById('teamAPlayers').value = (found.players || []).map(p => p.name).join(', ');
  }
}

async function onSelectTeamBChange() {
  const teamId = document.getElementById('selectTeamB').value;
  if (!teamId) return;

  const teams = await window.CricStorage.listTeams();
  const found = teams.find(t => t.id === teamId);
  if (found) {
    document.getElementById('teamBName').value = found.name;
    document.getElementById('teamBColor').value = found.colorHex || '#2196F3';
    document.getElementById('teamBPlayers').value = (found.players || []).map(p => p.name).join(', ');
  }
}

async function handleCreateMatch() {
  const teamAName = document.getElementById('teamAName').value || 'Rockets';
  const teamAColor = document.getElementById('teamAColor').value || '#FF5722';
  const teamAPlayersStr = document.getElementById('teamAPlayers').value || 'Alice, Bob, Charlie, David';

  const teamBName = document.getElementById('teamBName').value || 'Thunder';
  const teamBColor = document.getElementById('teamBColor').value || '#2196F3';
  const teamBPlayersStr = document.getElementById('teamBPlayers').value || 'Eve, Frank, Grace, Henry';

  const overs = parseInt(document.getElementById('matchOvers').value) || 5;
  const maxBowlerOvers = parseInt(document.getElementById('maxBowlerOvers').value) || 2;

  const teamA = {
    id: 'team_a_' + Date.now(),
    name: teamAName,
    colorHex: teamAColor,
    players: teamAPlayersStr.split(',').map((n, i) => ({
      id: `pa_${i}_${Date.now()}`,
      name: n.trim(),
      battingStats: { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, isRetiredHurt: false, wicketType: 'NONE' },
      bowlingStats: { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0, dotBalls: 0, wides: 0, noBalls: 0 }
    }))
  };

  const teamB = {
    id: 'team_b_' + Date.now(),
    name: teamBName,
    colorHex: teamBColor,
    players: teamBPlayersStr.split(',').map((n, i) => ({
      id: `pb_${i}_${Date.now()}`,
      name: n.trim(),
      battingStats: { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, isRetiredHurt: false, wicketType: 'NONE' },
      bowlingStats: { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0, dotBalls: 0, wides: 0, noBalls: 0 }
    }))
  };

  activeMatch = {
    id: 'match_' + Date.now(),
    tournamentId: activeTournament?.id || null,
    teamA,
    teamB,
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

  updateTossButtonsUI();
  document.getElementById('tossModal').classList.add('active');
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

  const teamABats = activeMatch.tossWinnerId === activeMatch.teamA.id ? selectedTossDecision === 'BAT' : selectedTossDecision === 'BOWL';
  activeMatch.battingTeamId = teamABats ? activeMatch.teamA.id : activeMatch.teamB.id;
  activeMatch.bowlingTeamId = teamABats ? activeMatch.teamB.id : activeMatch.teamA.id;

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
  activeMatch = await window.CricStorage.getMatch(matchId);
  if (!activeMatch) return;

  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  showLiveScreen();
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

  // Last Saved Tag
  const lastSavedTag = document.getElementById('lastSavedTag');
  if (lastSavedTag) {
    const timeStr = m.updatedAt ? new Date(m.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
    lastSavedTag.innerText = `Saved ${timeStr}`;
  }

  // Completed Match Summary Card (Requirement 2)
  const completedCard = document.getElementById('completedMatchCard');
  if (m.status === 'COMPLETED') {
    completedCard.style.display = 'block';
    const resultStr = window.ScoringEngine.getMatchResultString(m);
    document.getElementById('winnerTitle').innerText = resultStr;
    document.getElementById('marginText').innerText = `Match Completed | ${m.currentInnings === 2 ? 'Target Reached / Innings Ended' : 'Innings Completed'}`;
  } else {
    completedCard.style.display = 'none';
  }

  // Header Match Info
  const teamAColor = m.teamA?.colorHex || '#FF5722';
  const teamBColor = m.teamB?.colorHex || '#2196F3';
  document.getElementById('scoringHeader').innerHTML = `
    <span class="team-badge" style="background:${teamAColor}"></span>${m.teamA?.name} vs
    <span class="team-badge" style="background:${teamBColor}"></span>${m.teamB?.name}
  `;

  // Score Main
  document.getElementById('scoreMain').innerText = `${m.totalRuns || 0}/${m.totalWickets || 0}`;
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
    targetBanner.innerText = `Target: ${m.target} (Need ${remRuns} runs off ${remBalls} balls, RRR: ${rrr})`;
    document.getElementById('rrrText').innerText = `RRR: ${rrr}`;
  } else {
    targetBanner.style.display = 'none';
    document.getElementById('rrrText').innerText = `RRR: -`;
  }

  // Recent Balls Chips (Requirement 3)
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
    } else if (b.runs === 4) {
      div.classList.add('four');
      div.innerText = '4';
    } else if (b.runs === 6) {
      div.classList.add('six');
      div.innerText = '6';
    } else if (b.extrasType === 'GRANTED') {
      div.classList.add('extra');
      div.innerText = '1G';
    } else if (b.extrasType === 'WIDE') {
      div.classList.add('extra');
      div.innerText = `${b.extraRuns || 1}WD`;
    } else if (b.extrasType === 'NO_BALL') {
      div.classList.add('extra');
      div.innerText = `${(b.runs || 0) + (b.extraRuns || 1)}NB`;
    } else {
      div.innerText = b.runs || 0;
    }
    recentContainer.appendChild(div);
  });

  // Batters Table
  const battersBody = document.getElementById('battersTable');
  battersBody.innerHTML = '';

  const striker = (battingTeam?.players || []).find(p => p.id === m.strikerId);
  const nonStriker = (battingTeam?.players || []).find(p => p.id === m.nonStrikerId);

  [striker, nonStriker].forEach((p, idx) => {
    if (!p) return;
    const tr = document.createElement('tr');
    const isStriker = idx === 0;
    const stats = p.battingStats || { runs: 0, balls: 0, fours: 0, sixes: 0 };
    const sr = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(1) : '0.0';

    tr.innerHTML = `
      <td style="font-weight:700; color:#fff;">${p.name} ${isStriker ? '<span class="striker-star">★</span>' : ''}</td>
      <td style="text-align:right"><b>${stats.runs}</b></td>
      <td style="text-align:right">${stats.balls}</td>
      <td style="text-align:right">${stats.fours}</td>
      <td style="text-align:right">${stats.sixes}</td>
      <td style="text-align:right">${sr}</td>
    `;
    battersBody.appendChild(tr);
  });

  if (!striker && !nonStriker) {
    battersBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:10px;">Select Batters</td></tr>';
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

    tr.innerHTML = `
      <td style="font-weight:700; color:#fff;">${bowler.name}</td>
      <td style="text-align:right">${stats.overs}.${stats.balls}</td>
      <td style="text-align:right">${stats.maidens}</td>
      <td style="text-align:right">${stats.runsConceded}</td>
      <td style="text-align:right"><b>${stats.wickets}</b></td>
      <td style="text-align:right">${eco}</td>
    `;
    bowlerBody.appendChild(tr);
  } else {
    bowlerBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:10px;">Select Bowler</td></tr>';
  }

  // Action Prompt Banner
  const actionBanner = document.getElementById('actionBanner');
  if (m.pendingAction && m.pendingAction !== 'NONE') {
    actionBanner.style.display = 'block';
    actionBanner.innerText = `Pending Action: ${m.pendingAction.replace(/_/g, ' ')}`;
    promptPendingAction(m.pendingAction);
  } else {
    actionBanner.style.display = 'none';
  }
}

function promptPendingAction(action) {
  if (action === 'SELECT_STRIKER') openPlayerSelection('STRIKER');
  else if (action === 'SELECT_NON_STRIKER') openPlayerSelection('NON_STRIKER');
  else if (action === 'SELECT_BOWLER') openPlayerSelection('BOWLER');
}

// Improved Bowler Selection Flow (Gully Crix style - Requirement 3)
function openPlayerSelection(type) {
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
    title.innerText = 'Select Bowler for Next Over';
    dropdownGroup.style.display = 'none';
    confirmBtn.style.display = 'none';

    (bowlingTeam?.players || []).forEach(p => {
      const isLastBowler = p.id === m.lastBowlerId;
      const stats = p.bowlingStats || { overs: 0, balls: 0, runsConceded: 0, wickets: 0 };

      const item = document.createElement('div');
      item.className = `bowler-option ${isLastBowler ? 'disabled' : ''}`;
      if (!isLastBowler) {
        item.onclick = () => selectBowlerDirect(p.id);
      }

      item.innerHTML = `
        <div>
          <div style="font-weight:700; color:#fff;">${p.name} ${isLastBowler ? '<span style="font-size:10px; color:#fca5a5;">(Last Bowler)</span>' : ''}</div>
          <div style="font-size:11px; color:var(--text-muted);">${stats.overs}.${stats.balls} Ov | ${stats.runsConceded} Runs | ${stats.wickets} Wkts</div>
        </div>
        <button class="btn-primary" style="width:auto; padding:6px 12px; font-size:12px;" ${isLastBowler ? 'disabled' : ''}>Select</button>
      `;
      bowlerContainer.appendChild(item);
    });

  } else {
    // Striker / Non-Striker selection
    title.innerText = `Select ${type === 'STRIKER' ? 'Striker' : 'Non-Striker'}`;
    dropdownGroup.style.display = 'block';
    confirmBtn.style.display = 'block';

    const select = document.getElementById('selectionDropdown');
    select.innerHTML = '';
    const available = (battingTeam?.players || []).filter(p => !p.battingStats?.isOut && !p.battingStats?.isRetiredHurt && p.id !== m.strikerId && p.id !== m.nonStrikerId);
    available.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = p.name;
      select.appendChild(opt);
    });
  }

  modal.classList.add('active');
}

async function selectBowlerDirect(bowlerId) {
  if (!activeMatch) return;
  const adjustmentBall = {
    isAdjustment: true,
    adjustmentSlot: 'BOWLER',
    adjustmentPlayerId: bowlerId,
    isLegalBall: false,
    runs: 0,
    extrasType: "NONE",
    wicketType: "NONE"
  };

  activeMatch.currentBowlerId = bowlerId;
  document.getElementById('selectionModal').classList.remove('active');
  activeMatch = await window.CricStorage.addBall(activeMatch.id, adjustmentBall);
  renderLiveScoring();
}

async function confirmPlayerSelection() {
  const select = document.getElementById('selectionDropdown');
  const selectedId = select.value;
  if (!selectedId || !activeMatch) return;

  const slot = currentSelectionType;
  const adjustmentBall = {
    isAdjustment: true,
    adjustmentSlot: slot,
    adjustmentPlayerId: selectedId,
    isLegalBall: false,
    runs: 0,
    extrasType: "NONE",
    wicketType: "NONE"
  };

  if (slot === 'STRIKER') activeMatch.strikerId = selectedId;
  else if (slot === 'NON_STRIKER') activeMatch.nonStrikerId = selectedId;

  document.getElementById('selectionModal').classList.remove('active');
  activeMatch = await window.CricStorage.addBall(activeMatch.id, adjustmentBall);
  renderLiveScoring();
}

async function addBall(runs) {
  if (!activeMatch) return;
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

  // End-of-Over Popup Detection (Requirement 3)
  const newBalls = activeMatch.totalBalls || 0;
  if (newBalls > 0 && newBalls % 6 === 0 && newBalls !== prevBalls) {
    checkAndShowOverEndModal();
  }

  renderLiveScoring();
}

async function addExtra(type) {
  if (!activeMatch) return;
  const ball = {
    runs: 0,
    extrasType: type,
    extraRuns: 1,
    wicketType: 'NONE',
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  renderLiveScoring();
}

async function addGrantedRun() {
  if (!activeMatch) return;
  const ball = {
    runs: 1,
    extrasType: "GRANTED",
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
  if (!activeMatch) return;
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
  document.getElementById('wicketModal').classList.add('active');
}

function closeWicketModal() {
  document.getElementById('wicketModal').classList.remove('active');
}

async function submitWicket() {
  if (!activeMatch) return;
  const type = document.getElementById('wicketTypeSelect').value;
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

async function undoLastBall() {
  if (!activeMatch) return;
  activeMatch = await window.CricStorage.undoBall(activeMatch.id);
  renderLiveScoring();
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
    const status = s.isOut ? `b/c (${s.wicketType})` : (s.isRetiredHurt ? 'Retired Hurt' : 'not out');

    return `
      <tr>
        <td style="font-weight:600; color:#fff;">${p.name}<br><span style="font-size:10px; color:var(--text-muted);">${status}</span></td>
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

    return `
      <tr>
        <td style="font-weight:600; color:#fff;">${p.name}</td>
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
  const name = document.getElementById('newPlayerName').value;
  const role = document.getElementById('newPlayerRole').value;
  const style = document.getElementById('newPlayerStyle').value;
  if (!name) return;

  await window.CricStorage.addGlobalPlayer({
    id: id || ('gp_' + Date.now()),
    name,
    role,
    style
  });

  closePlayerModal();
  renderPlayers();
}

async function deletePlayer(id) {
  if (confirm("Are you sure you want to delete this player?")) {
    await window.CricStorage.deleteGlobalPlayer(id);
    renderPlayers();
  }
}

// Stats & Leaderboards
async function renderStats() {
  const container = document.getElementById('statsContainer');
  const matches = await window.CricStorage.listMatches();

  let allBatters = [];
  let allBowlers = [];

  matches.forEach(m => {
    [m.teamA, m.teamB].forEach(t => {
      (t?.players || []).forEach(p => {
        if (p.battingStats && p.battingStats.runs > 0) {
          allBatters.push({ name: p.name, runs: p.battingStats.runs, balls: p.battingStats.balls, fours: p.battingStats.fours, sixes: p.battingStats.sixes });
        }
        if (p.bowlingStats && p.bowlingStats.wickets > 0) {
          allBowlers.push({ name: p.name, wickets: p.bowlingStats.wickets, runs: p.bowlingStats.runsConceded, overs: p.bowlingStats.overs });
        }
      });
    });
  });

  allBatters.sort((a, b) => b.runs - a.runs);
  allBowlers.sort((a, b) => b.wickets - a.wickets);

  const topBatHtml = allBatters.slice(0, 5).map(b => `
    <tr>
      <td style="font-weight:700;">${b.name}</td>
      <td style="text-align:right"><b>${b.runs}</b></td>
      <td style="text-align:right">${b.balls}</td>
      <td style="text-align:right">${b.fours}</td>
      <td style="text-align:right">${b.sixes}</td>
    </tr>
  `).join('');

  const topBowlHtml = allBowlers.slice(0, 5).map(b => `
    <tr>
      <td style="font-weight:700;">${b.name}</td>
      <td style="text-align:right"><b>${b.wickets}</b></td>
      <td style="text-align:right">${b.runs}</td>
      <td style="text-align:right">${b.overs}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">🏏 Top Run Scorers</h4>
    <table class="stats-table">
      <thead><tr><th>Batter</th><th style="text-align:right">Runs</th><th style="text-align:right">Balls</th><th style="text-align:right">4s</th><th style="text-align:right">6s</th></tr></thead>
      <tbody>${topBatHtml || '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No batting stats yet</td></tr>'}</tbody>
    </table>

    <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; margin-top:16px; margin-bottom:6px;">⚾ Top Wicket Takers</h4>
    <table class="stats-table">
      <thead><tr><th>Bowler</th><th style="text-align:right">Wkts</th><th style="text-align:right">Runs</th><th style="text-align:right">Overs</th></tr></thead>
      <tbody>${topBowlHtml || '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No bowling stats yet</td></tr>'}</tbody>
    </table>
  `;
}

// Global initialization
window.addEventListener('DOMContentLoaded', async () => {
  const matches = await window.CricStorage.listMatches();
  if (matches && matches.length > 0) {
    selectMatch(matches[0].id);
  } else {
    loadMatchListScreen();
  }
});
