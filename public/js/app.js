// App Controller for CricScore Pro Web PWA

let activeMatch = null;
let currentSelectionType = null; // STRIKER, NON_STRIKER, BOWLER

let selectedTossWinnerId = null;
let selectedTossDecision = 'BAT';

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

function showNewMatchScreen() {
  showScreen('screenNewMatch');
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
    gullyRules: {}
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

  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  await window.CricStorage.saveMatch(activeMatch);

  closeMatchSettingsModal();
  renderLiveScoring();
}

async function selectMatch(matchId) {
  activeMatch = await window.CricStorage.getMatch(matchId);
  if (!activeMatch) return;

  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  showLiveScreen();
}

function renderLiveScoring() {
  if (!activeMatch) return;

  const m = activeMatch;
  const isBattingA = m.battingTeamId === m.teamA?.id;
  const battingTeam = isBattingA ? m.teamA : m.teamB;
  const bowlingTeam = isBattingA ? m.teamB : m.teamA;

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

    if (b.wicketType && b.wicketType !== 'NONE') {
      div.classList.add('wicket');
      div.innerText = 'W';
    } else if (b.runs === 4) {
      div.classList.add('four');
      div.innerText = '4';
    } else if (b.runs === 6) {
      div.classList.add('six');
      div.innerText = '6';
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

function openPlayerSelection(type) {
  currentSelectionType = type;
  const m = activeMatch;
  if (!m) return;

  const isBattingA = m.battingTeamId === m.teamA?.id;
  const battingTeam = isBattingA ? m.teamA : m.teamB;
  const bowlingTeam = isBattingA ? m.teamB : m.teamA;

  const modal = document.getElementById('selectionModal');
  const title = document.getElementById('selectionTitle');
  const select = document.getElementById('selectionDropdown');
  select.innerHTML = '';

  if (type === 'STRIKER' || type === 'NON_STRIKER') {
    title.innerText = `Select ${type === 'STRIKER' ? 'Striker' : 'Non-Striker'}`;
    const available = (battingTeam?.players || []).filter(p => !p.battingStats?.isOut && p.id !== m.strikerId && p.id !== m.nonStrikerId);
    available.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = p.name;
      select.appendChild(opt);
    });
  } else if (type === 'BOWLER') {
    title.innerText = 'Select Bowler';
    const available = (bowlingTeam?.players || []).filter(p => p.id !== m.lastBowlerId);
    available.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = p.name;
      select.appendChild(opt);
    });
  }

  modal.classList.add('active');
}

function confirmPlayerSelection() {
  const select = document.getElementById('selectionDropdown');
  const selectedId = select.value;
  if (!selectedId || !activeMatch) return;

  if (currentSelectionType === 'STRIKER') activeMatch.strikerId = selectedId;
  else if (currentSelectionType === 'NON_STRIKER') activeMatch.nonStrikerId = selectedId;
  else if (currentSelectionType === 'BOWLER') activeMatch.currentBowlerId = selectedId;

  activeMatch.pendingAction = 'NONE';
  document.getElementById('selectionModal').classList.remove('active');
  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
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

  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
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

// Overs Breakdown Timeline (OversViews.kt parity)
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
      if (b.wicketType && b.wicketType !== 'NONE') { label = 'W'; cls += ' wicket'; }
      else if (b.runs === 4) cls += ' four';
      else if (b.runs === 6) cls += ' six';
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

// Tournaments & Points Table (TournamentDetailsScreen.kt parity)
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

    card.innerHTML = `
      <h4 style="font-size:16px; font-weight:800; color:#fff; margin-bottom:8px;">🏆 ${t.name}</h4>
      <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Points Table</div>
      <table class="stats-table">
        <thead>
          <tr><th>Team</th><th style="text-align:right">P</th><th style="text-align:right">W</th><th style="text-align:right">L</th><th style="text-align:right">PTS</th></tr>
        </thead>
        <tbody>${tableRows || '<tr><td colspan="5" style="text-align:center;">Add teams to calculate standings</td></tr>'}</tbody>
      </table>
    `;
    container.appendChild(card);
  });
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
    teams: [
      { id: 't1', name: 'Rockets', colorHex: '#FF5722' },
      { id: 't2', name: 'Thunder', colorHex: '#2196F3' }
    ]
  };

  await window.CricStorage.saveTournament(tourney);
  closeTournamentModal();
  renderTournaments();
}

// Global Player Roster (GlobalPlayerRepository.kt parity)
async function renderPlayers() {
  const container = document.getElementById('playersContainer');
  const players = await window.CricStorage.listGlobalPlayers();
  container.innerHTML = '';

  players.forEach(p => {
    const item = document.createElement('div');
    item.className = 'over-card-row';

    item.innerHTML = `
      <div>
        <div style="font-size:14px; font-weight:700; color:#fff;">👤 ${p.name}</div>
        <div style="font-size:11px; color:var(--text-muted);">${p.role || 'Batter'} | ${p.style || 'RHB'}</div>
      </div>
      <span class="status-badge" style="background:#334155; color:#cbd5e1;">Available</span>
    `;
    container.appendChild(item);
  });
}

function openNewPlayerModal() {
  document.getElementById('playerModal').classList.add('active');
}

function closePlayerModal() {
  document.getElementById('playerModal').classList.remove('active');
}

async function handleCreatePlayer() {
  const name = document.getElementById('newPlayerName').value;
  const role = document.getElementById('newPlayerRole').value;
  if (!name) return;

  await window.CricStorage.addGlobalPlayer({
    id: 'gp_' + Date.now(),
    name,
    role,
    style: 'RHB'
  });

  closePlayerModal();
  renderPlayers();
}

// Stats & Leaderboards (StatsViews.kt parity)
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
    handleCreateMatch();
  }
});
