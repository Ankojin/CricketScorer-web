// App Controller for Static Web MVP

let activeMatch = null;

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

async function loadMatchListScreen() {
  showScreen('screenMatchList');
  const listEl = document.getElementById('matchListContainer');
  listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">Loading matches...</div>';

  const matches = await window.CricStorage.listMatches();
  listEl.innerHTML = '';

  if (matches.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">No matches found. Create a new match to start scoring!</div>';
    return;
  }

  matches.forEach(m => {
    const item = document.createElement('div');
    item.className = 'match-item';
    item.onclick = () => selectMatch(m.id);

    const teamAColor = m.teamA?.colorHex || '#FF5722';
    const teamBColor = m.teamB?.colorHex || '#2196F3';
    const overStr = `${Math.floor((m.totalBalls || 0) / 6)}.${(m.totalBalls || 0) % 6}`;

    item.innerHTML = `
      <div>
        <div style="font-weight:700; font-size:15px;">
          <span class="team-badge" style="background:${teamAColor}"></span>${m.teamA?.name || 'Team A'} vs
          <span class="team-badge" style="background:${teamBColor}"></span>${m.teamB?.name || 'Team B'}
        </div>
        <div style="font-size:12px; color:#aaa; margin-top:4px;">
          Status: <span style="color:#2196f3; font-weight:600;">${m.status || 'LIVE'}</span> | Overs: ${overStr} / ${m.oversPerInnings || 20}
        </div>
      </div>
      <div style="font-size:20px; font-weight:800; color:#fff;">
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
  const teamBName = document.getElementById('teamBName').value || 'Thunder';
  const teamBColor = document.getElementById('teamBColor').value || '#2196F3';
  const overs = parseInt(document.getElementById('matchOvers').value) || 5;

  const teamA = {
    id: 'team_a_' + Date.now(),
    name: teamAName,
    colorHex: teamAColor,
    players: [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Charlie' }
    ]
  };

  const teamB = {
    id: 'team_b_' + Date.now(),
    name: teamBName,
    colorHex: teamBColor,
    players: [
      { id: 'p4', name: 'David' },
      { id: 'p5', name: 'Eve' },
      { id: 'p6', name: 'Frank' }
    ]
  };

  const match = {
    id: 'match_' + Date.now(),
    teamA,
    teamB,
    tossWinnerId: teamA.id,
    tossDecision: 'BAT',
    status: 'LIVE',
    currentInnings: 1,
    battingTeamId: teamA.id,
    bowlingTeamId: teamB.id,
    totalRuns: 0,
    totalWickets: 0,
    totalBalls: 0,
    oversPerInnings: overs,
    ballHistory: [],
    strikerId: 'p1',
    nonStrikerId: 'p2',
    currentBowlerId: 'p4'
  };

  const created = await window.CricStorage.createMatch(match);
  selectMatch(created.id);
}

async function selectMatch(matchId) {
  activeMatch = await window.CricStorage.getMatch(matchId);
  if (!activeMatch) return;

  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  renderLiveScoring();
  showScreen('screenLiveScoring');
}

function renderLiveScoring() {
  if (!activeMatch) return;

  const m = activeMatch;
  const teamAColor = m.teamA?.colorHex || '#FF5722';
  const teamBColor = m.teamB?.colorHex || '#2196F3';

  document.getElementById('scoringHeader').innerHTML = `
    <span class="team-badge" style="background:${teamAColor}"></span>${m.teamA?.name} vs
    <span class="team-badge" style="background:${teamBColor}"></span>${m.teamB?.name}
  `;

  document.getElementById('scoreMain').innerText = `${m.totalRuns || 0}/${m.totalWickets || 0}`;
  const overStr = `${Math.floor((m.totalBalls || 0) / 6)}.${(m.totalBalls || 0) % 6}`;
  document.getElementById('oversText').innerText = `Overs: ${overStr} / ${m.oversPerInnings || 20}`;

  const totalOversDec = (m.totalBalls || 0) / 6;
  const crr = totalOversDec > 0 ? ((m.totalRuns || 0) / totalOversDec).toFixed(2) : '0.00';
  document.getElementById('crrText').innerText = `CRR: ${crr}`;

  const targetBanner = document.getElementById('targetBanner');
  if (m.currentInnings === 2 && m.target) {
    const remRuns = m.target - m.totalRuns;
    const remBalls = (m.oversPerInnings * 6) - m.totalBalls;
    targetBanner.style.display = 'block';
    targetBanner.innerText = `Target: ${m.target} (Need ${remRuns} runs off ${remBalls} balls)`;
  } else {
    targetBanner.style.display = 'none';
  }

  // Render recent balls with 4/6/W colors
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

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  loadMatchListScreen();
});
