// CricScore Pro Web PWA Client Controller

// API Endpoint Config (Will update dynamically if set or fallback to LocalStorage)
let API_BASE_URL = window.location.origin.includes('localhost') || window.location.origin.includes('8080')
  ? 'http://localhost:3000'
  : 'https://api.cricscorepro.internal';

let activeMatch = null;
let currentSelectionType = null; // STRIKER, NON_STRIKER, BOWLER

// Local Pure JS Scoring Engine Port for offline reactivity
function isPhysicalBall(ball) {
  return !ball.isAdjustment &&
    ball.extrasType !== 'WIDE' &&
    ball.extrasType !== 'NO_BALL' &&
    ball.wicketType !== 'RETIRED_HURT';
}

function resetTeamStats(team) {
  return {
    ...team,
    players: (team.players || []).map(p => ({
      ...p,
      battingStats: { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, isRetiredHurt: false, wicketType: 'NONE' },
      bowlingStats: { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0, dotBalls: 0, wides: 0, noBalls: 0 },
      fieldingStats: { catches: 0, runOuts: 0, stumpings: 0, droppedCatches: 0 }
    }))
  };
}

function updateTeamStats(team, ball, isBat, isBowl) {
  return {
    ...team,
    players: (team.players || []).map(p => {
      let np = { ...p };
      if (isBat) {
        const outId = ball.outPlayerId || (ball.wicketType && ball.wicketType !== 'NONE' ? ball.strikerId : null);
        const isOut = p.id === outId;

        if (p.id === ball.strikerId) {
          const actualRuns = ball.runs + (ball.extrasType === 'GRANTED' ? ball.extraRuns || 0 : 0);
          const isLegal = ball.isLegalBall !== false && ball.extrasType !== 'WIDE';
          const isNoBall = ball.extrasType === 'NO_BALL';

          np = {
            ...np,
            battingStats: {
              ...np.battingStats,
              runs: (np.battingStats?.runs || 0) + actualRuns,
              balls: (np.battingStats?.balls || 0) + (isLegal || isNoBall ? 1 : 0),
              fours: (np.battingStats?.fours || 0) + (actualRuns === 4 ? 1 : 0),
              sixes: (np.battingStats?.sixes || 0) + (actualRuns === 6 ? 1 : 0),
              isOut: (np.battingStats?.isOut || false) || (isOut && ball.wicketType !== 'RETIRED_HURT'),
              isRetiredHurt: ball.wicketType === 'RETIRED_HURT',
              wicketType: isOut ? ball.wicketType || 'NONE' : (np.battingStats?.wicketType || 'NONE'),
              dismissalBowlerId: isOut && ball.wicketType !== 'RUN_OUT' && ball.wicketType !== 'RETIRED_HURT' ? ball.bowlerId : np.battingStats?.dismissalBowlerId,
              dismissalFielderId: isOut ? ball.fielderId : np.battingStats?.dismissalFielderId
            }
          };
        } else if (p.id === ball.nonStrikerId) {
          if (isOut) {
            np = {
              ...np,
              battingStats: {
                ...np.battingStats,
                isOut: ball.wicketType !== 'RETIRED_HURT',
                isRetiredHurt: ball.wicketType === 'RETIRED_HURT',
                wicketType: ball.wicketType || 'NONE',
                dismissalFielderId: ball.fielderId
              }
            };
          }
        }
      }

      if (isBowl && p.id === ball.bowlerId) {
        const isPhysical = isPhysicalBall(ball);
        let nb = np.bowlingStats?.balls || 0;
        let no = np.bowlingStats?.overs || 0;

        if (isPhysical) {
          nb++;
          if (nb === 6) {
            no++;
            nb = 0;
          }
        }

        const runsToBowler = ball.extrasType === 'BYE' || ball.extrasType === 'LEG_BYE' ? ball.runs : ball.runs + (ball.extraRuns || 0);
        const isBowlerWicket = ball.wicketType && ball.wicketType !== 'NONE' && ball.wicketType !== 'RUN_OUT' && ball.wicketType !== 'RETIRED_HURT';

        np = {
          ...np,
          bowlingStats: {
            ...np.bowlingStats,
            runsConceded: (np.bowlingStats?.runsConceded || 0) + runsToBowler,
            balls: nb,
            overs: no,
            wickets: (np.bowlingStats?.wickets || 0) + (isBowlerWicket ? 1 : 0),
            dotBalls: (np.bowlingStats?.dotBalls || 0) + (ball.runs === 0 && (!ball.extraRuns || ball.extraRuns === 0) ? 1 : 0),
            wides: (np.bowlingStats?.wides || 0) + (ball.extrasType === 'WIDE' ? 1 : 0),
            noBalls: (np.bowlingStats?.noBalls || 0) + (ball.extrasType === 'NO_BALL' ? 1 : 0)
          }
        };
      }
      return np;
    })
  };
}

function recalculateMatch(match) {
  if (!match.tossWinnerId) {
    return { ...match, pendingAction: 'TOSS_REQUIRED' };
  }

  const teamABatsFirst = match.tossWinnerId === match.teamA.id ? match.tossDecision === 'BAT' : match.tossDecision === 'BOWL';
  const innings1BattingTeamId = teamABatsFirst ? match.teamA.id : match.teamB.id;
  const innings1BowlingTeamId = innings1BattingTeamId === match.teamA.id ? match.teamB.id : match.teamA.id;

  let current = {
    ...match,
    totalRuns: 0,
    totalWickets: 0,
    totalBalls: 0,
    wideCount: 0,
    noBallCount: 0,
    byeCount: 0,
    legByeCount: 0,
    wicketHistory: [],
    battingOrder: [],
    teamA: resetTeamStats(match.teamA),
    teamB: resetTeamStats(match.teamB),
    status: 'LIVE',
    currentInnings: match.currentInnings || 1,
    battingTeamId: match.currentInnings === 2 ? innings1BowlingTeamId : innings1BattingTeamId,
    bowlingTeamId: match.currentInnings === 2 ? innings1BattingTeamId : innings1BowlingTeamId,
    strikerId: match.strikerId || null,
    nonStrikerId: match.nonStrikerId || null,
    currentBowlerId: match.currentBowlerId || null,
    lastBowlerId: match.lastBowlerId || null,
    pendingAction: 'NONE'
  };

  let ballsInOver = 0;
  const history = match.ballHistory || [];

  for (let i = 0; i < history.length; i++) {
    const ball = history[i];
    if (current.status === 'COMPLETED') break;

    const isBattingA = current.battingTeamId === current.teamA.id;
    const battingTeam = isBattingA ? current.teamA : current.teamB;
    const bowlingTeam = isBattingA ? current.teamB : current.teamA;

    const isPhysical = isPhysicalBall(ball);
    const isRealWicket = ball.wicketType && ball.wicketType !== 'NONE' && ball.wicketType !== 'RETIRED_HURT';

    current = {
      ...current,
      totalRuns: current.totalRuns + ball.runs + (ball.extraRuns || 0),
      totalWickets: current.totalWickets + (isRealWicket ? 1 : 0),
      totalBalls: current.totalBalls + (isPhysical ? 1 : 0),
      wideCount: current.wideCount + (ball.extrasType === 'WIDE' ? ball.extraRuns || 0 : 0),
      noBallCount: current.noBallCount + (ball.extrasType === 'NO_BALL' ? ball.extraRuns || 0 : 0),
      byeCount: current.byeCount + (ball.extrasType === 'BYE' ? ball.extraRuns || 0 : 0),
      legByeCount: current.legByeCount + (ball.extrasType === 'LEG_BYE' ? ball.extraRuns || 0 : 0),
      teamA: updateTeamStats(current.teamA, ball, isBattingA, !isBattingA),
      teamB: updateTeamStats(current.teamB, ball, !isBattingA, isBattingA),
      ballHistory: history.slice(0, i + 1)
    };

    if (isRealWicket) {
      const outId = ball.outPlayerId || ball.strikerId;
      const outName = (battingTeam.players || []).find(p => p.id === outId)?.name || 'Unknown';
      const bName = (bowlingTeam.players || []).find(p => p.id === ball.bowlerId)?.name;
      const fName = (bowlingTeam.players || []).find(p => p.id === ball.fielderId)?.name;
      const overStr = `${Math.floor(current.totalBalls / 6)}.${current.totalBalls % 6}`;

      current.wicketHistory.push({
        wicketNumber: current.totalWickets,
        batterName: `☝️ ${outName}`,
        totalRuns: current.totalRuns,
        over: overStr,
        wicketType: ball.wicketType || 'NONE',
        bowlerName: bName,
        fielderName: fName,
        dismissalReason: ball.dismissalReason
      });
    }

    if (isPhysical) ballsInOver++;

    let sId = current.strikerId;
    let nsId = current.nonStrikerId;
    let activeBId = current.currentBowlerId;
    let lbId = current.lastBowlerId;

    if (!ball.isAdjustment) {
      const victimId = ball.outPlayerId || (ball.wicketType && ball.wicketType !== 'NONE' ? ball.strikerId : null);
      if (!sId && ball.strikerId && ball.strikerId !== victimId) sId = ball.strikerId;
      if (!nsId && ball.nonStrikerId && ball.nonStrikerId !== victimId) nsId = ball.nonStrikerId;
      if (!activeBId) activeBId = ball.bowlerId;
    }

    let physicalRuns = 0;
    if (ball.extrasType === 'WIDE') {
      physicalRuns = current.gullyRules?.noExtraRunsForWidesNoBalls ? ball.extraRuns || 0 : Math.max(0, (ball.extraRuns || 0) - 1);
    } else if (ball.extrasType === 'BYE' || ball.extrasType === 'LEG_BYE') {
      physicalRuns = ball.extraRuns || 0;
    } else {
      physicalRuns = ball.runs + (ball.extrasType === 'GRANTED' ? ball.extraRuns || 0 : 0);
    }

    const shouldRotate = physicalRuns % 2 !== 0 !== Boolean(ball.hadCrossed) && ball.rotateStrike !== false && ball.extrasType !== 'GRANTED';
    if (shouldRotate) {
      const temp = sId; sId = nsId; nsId = temp;
    }

    if (ball.wicketType && ball.wicketType !== 'NONE') {
      const victimId = ball.outPlayerId || ball.strikerId;
      if (ball.wicketType === 'CAUGHT') {
        sId = null;
      } else {
        if (sId === victimId) sId = null;
        else if (nsId === victimId) nsId = null;
      }
    }

    let overJustFinished = false;
    if (ballsInOver === 6) {
      const temp = sId; sId = nsId; nsId = temp;
      lbId = activeBId; activeBId = null;
      ballsInOver = 0; overJustFinished = true;
    }

    const squadSize = current.gullyRules?.unequalTeams
      ? battingTeam.players.length
      : Math.max(1, Math.min((current.teamA.players || []).length, (current.teamB.players || []).length));
    const maxWickets = current.gullyRules?.lastManStanding ? squadSize : Math.max(1, squadSize - 1);

    current = {
      ...current,
      strikerId: sId,
      nonStrikerId: nsId,
      currentBowlerId: overJustFinished ? null : activeBId,
      lastBowlerId: lbId
    };

    const inningsEnded = current.totalWickets >= maxWickets || current.totalBalls >= (current.oversPerInnings || 20) * 6;

    if (current.currentInnings === 1 && inningsEnded) {
      current = {
        ...current,
        currentInnings: 2,
        target: current.totalRuns + 1,
        battingTeamId: current.bowlingTeamId,
        bowlingTeamId: current.battingTeamId,
        totalRuns: 0,
        totalWickets: 0,
        totalBalls: 0,
        wideCount: 0,
        noBallCount: 0,
        byeCount: 0,
        legByeCount: 0,
        wicketHistory: [],
        strikerId: null,
        nonStrikerId: null,
        currentBowlerId: null,
        lastBowlerId: null,
        pendingAction: 'START_SECOND_INNINGS'
      };
      ballsInOver = 0;
    } else if (current.currentInnings === 2 && current.status === 'LIVE' && current.target != null && (current.totalBalls > 0 || current.totalWickets > 0)) {
      if (current.totalRuns >= current.target) {
        current = { ...current, status: 'COMPLETED', winnerId: current.battingTeamId };
      } else if (inningsEnded) {
        current = { ...current, status: 'COMPLETED', winnerId: current.totalRuns < current.target - 1 ? current.bowlingTeamId : null };
      }
    }
  }

  if (current.status === 'LIVE') {
    if (!current.strikerId) current.pendingAction = 'SELECT_STRIKER';
    else if (!current.nonStrikerId) current.pendingAction = 'SELECT_NON_STRIKER';
    else if (!current.currentBowlerId) current.pendingAction = 'SELECT_BOWLER';
  }

  return current;
}

// UI Rendering Functions
function render() {
  if (!activeMatch) return;

  const m = activeMatch;
  const isBattingA = m.battingTeamId === m.teamA.id;
  const battingTeam = isBattingA ? m.teamA : m.teamB;
  const bowlingTeam = isBattingA ? m.teamB : m.teamA;

  // Header Match Info
  const teamAColor = m.teamA.colorHex || '#FF5722';
  const teamBColor = m.teamB.colorHex || '#2196F3';
  document.getElementById('matchTeams').innerHTML = `
    <span class="team-badge" style="background:${teamAColor}"></span>${m.teamA.name}
    vs
    <span class="team-badge" style="background:${teamBColor}"></span>${m.teamB.name}
  `;

  // Score
  document.getElementById('scoreDisplay').innerText = `${m.totalRuns}/${m.totalWickets}`;
  const overStr = `${Math.floor(m.totalBalls / 6)}.${m.totalBalls % 6}`;
  document.getElementById('oversDisplay').innerText = `Overs: ${overStr} / ${m.oversPerInnings || 20}`;

  // Run Rates
  const totalOversDec = (m.totalBalls / 6);
  const crr = totalOversDec > 0 ? (m.totalRuns / totalOversDec).toFixed(2) : '0.00';
  document.getElementById('ratesDisplay').children[0].innerText = `CRR: ${crr}`;

  // Target Banner
  const targetBanner = document.getElementById('targetBanner');
  if (m.currentInnings === 2 && m.target) {
    const remainingRuns = m.target - m.totalRuns;
    const remainingBalls = (m.oversPerInnings * 6) - m.totalBalls;
    const rrr = (remainingBalls > 0 && remainingRuns > 0) ? ((remainingRuns / remainingBalls) * 6).toFixed(2) : '0.00';
    targetBanner.style.display = 'block';
    targetBanner.innerText = `Target: ${m.target} (Need ${remainingRuns} off ${remainingBalls} balls, RRR: ${rrr})`;
    document.getElementById('rrrDisplay').innerText = `RRR: ${rrr}`;
  } else {
    targetBanner.style.display = 'none';
    document.getElementById('rrrDisplay').innerText = `RRR: -`;
  }

  // Recent Balls
  const recentContainer = document.getElementById('recentBalls');
  recentContainer.innerHTML = '';
  const history = m.ballHistory || [];
  const recent = history.slice(-8);
  recent.forEach(b => {
    const div = document.createElement('div');
    div.className = 'ball-circle';
    if (b.wicketType && b.wicketType !== 'NONE') {
      div.classList.add('wicket');
      div.innerText = 'W';
    } else if (b.extrasType === 'WIDE') {
      div.classList.add('wide');
      div.innerText = `${b.extraRuns}WD`;
    } else if (b.extrasType === 'NO_BALL') {
      div.classList.add('noball');
      div.innerText = `${b.runs + b.extraRuns}NB`;
    } else if (b.runs === 4) {
      div.classList.add('four');
      div.innerText = '4';
    } else if (b.runs === 6) {
      div.classList.add('six');
      div.innerText = '6';
    } else {
      div.innerText = b.runs;
    }
    recentContainer.appendChild(div);
  });

  // Batters Table
  const battersBody = document.getElementById('battersTable');
  battersBody.innerHTML = '';

  const striker = (battingTeam.players || []).find(p => p.id === m.strikerId);
  const nonStriker = (battingTeam.players || []).find(p => p.id === m.nonStrikerId);

  [striker, nonStriker].forEach((p, idx) => {
    if (!p) return;
    const tr = document.createElement('tr');
    const isStriker = idx === 0;
    const stats = p.battingStats || { runs: 0, balls: 0, fours: 0, sixes: 0 };
    const sr = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(1) : '0.0';

    tr.innerHTML = `
      <td class="player-name">${p.name} ${isStriker ? '<span class="striker-star">★</span>' : ''}</td>
      <td style="text-align:right"><b>${stats.runs}</b></td>
      <td style="text-align:right">${stats.balls}</td>
      <td style="text-align:right">${stats.fours}</td>
      <td style="text-align:right">${stats.sixes}</td>
      <td style="text-align:right">${sr}</td>
    `;
    battersBody.appendChild(tr);
  });

  if (!striker && !nonStriker) {
    battersBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">Select Batters</td></tr>';
  }

  // Bowler Table
  const bowlerBody = document.getElementById('bowlerTable');
  bowlerBody.innerHTML = '';
  const bowler = (bowlingTeam.players || []).find(p => p.id === m.currentBowlerId);
  if (bowler) {
    const tr = document.createElement('tr');
    const stats = bowler.bowlingStats || { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0 };
    const totalOversDec = stats.overs + (stats.balls / 6);
    const eco = totalOversDec > 0 ? (stats.runsConceded / totalOversDec).toFixed(2) : '0.00';

    tr.innerHTML = `
      <td class="player-name">${bowler.name}</td>
      <td style="text-align:right">${stats.overs}.${stats.balls}</td>
      <td style="text-align:right">${stats.maidens}</td>
      <td style="text-align:right">${stats.runsConceded}</td>
      <td style="text-align:right"><b>${stats.wickets}</b></td>
      <td style="text-align:right">${eco}</td>
    `;
    bowlerBody.appendChild(tr);
  } else {
    bowlerBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">Select Bowler</td></tr>';
  }

  // Action Banner & Modal Prompt
  const actionBanner = document.getElementById('actionBanner');
  if (m.pendingAction && m.pendingAction !== 'NONE') {
    actionBanner.style.display = 'block';
    actionBanner.innerText = `Pending Action: ${m.pendingAction.replace('_', ' ')}`;
    promptPendingAction(m.pendingAction);
  } else {
    actionBanner.style.display = 'none';
  }

  saveActiveMatch();
}

function promptPendingAction(action) {
  if (action === 'SELECT_STRIKER') openPlayerSelection('STRIKER');
  else if (action === 'SELECT_NON_STRIKER') openPlayerSelection('NON_STRIKER');
  else if (action === 'SELECT_BOWLER') openPlayerSelection('BOWLER');
}

function openPlayerSelection(type) {
  currentSelectionType = type;
  const m = activeMatch;
  const isBattingA = m.battingTeamId === m.teamA.id;
  const battingTeam = isBattingA ? m.teamA : m.teamB;
  const bowlingTeam = isBattingA ? m.teamB : m.teamA;

  const modal = document.getElementById('selectionModal');
  const title = document.getElementById('selectionTitle');
  const select = document.getElementById('selectionDropdown');
  select.innerHTML = '';

  if (type === 'STRIKER' || type === 'NON_STRIKER') {
    title.innerText = `Select ${type === 'STRIKER' ? 'Striker' : 'Non-Striker'}`;
    const available = (battingTeam.players || []).filter(p => !p.battingStats?.isOut && p.id !== m.strikerId && p.id !== m.nonStrikerId);
    available.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = p.name;
      select.appendChild(opt);
    });
  } else if (type === 'BOWLER') {
    title.innerText = 'Select Bowler for Next Over';
    const available = (bowlingTeam.players || []).filter(p => p.id !== m.lastBowlerId);
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
  if (!selectedId) return;

  if (currentSelectionType === 'STRIKER') activeMatch.strikerId = selectedId;
  else if (currentSelectionType === 'NON_STRIKER') activeMatch.nonStrikerId = selectedId;
  else if (currentSelectionType === 'BOWLER') activeMatch.currentBowlerId = selectedId;

  activeMatch.pendingAction = 'NONE';
  document.getElementById('selectionModal').classList.remove('active');
  activeMatch = recalculateMatch(activeMatch);
  render();
}

function addBall(runs) {
  if (!activeMatch || activeMatch.status === 'COMPLETED') return;

  const ball = {
    runs,
    extrasType: 'NONE',
    extraRuns: 0,
    wicketType: 'NONE',
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId,
    rotateStrike: true
  };

  activeMatch.ballHistory = [...(activeMatch.ballHistory || []), ball];
  activeMatch = recalculateMatch(activeMatch);
  render();
}

function addExtra(type) {
  if (!activeMatch || activeMatch.status === 'COMPLETED') return;

  const ball = {
    runs: 0,
    extrasType: type,
    extraRuns: 1,
    wicketType: 'NONE',
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  activeMatch.ballHistory = [...(activeMatch.ballHistory || []), ball];
  activeMatch = recalculateMatch(activeMatch);
  render();
}

function openWicketModal() {
  if (!activeMatch) return;

  const isBattingA = activeMatch.battingTeamId === activeMatch.teamA.id;
  const battingTeam = isBattingA ? activeMatch.teamA : activeMatch.teamB;
  const bowlingTeam = isBattingA ? activeMatch.teamB : activeMatch.teamA;

  const outSelect = document.getElementById('outPlayerId');
  outSelect.innerHTML = '';
  [activeMatch.strikerId, activeMatch.nonStrikerId].forEach(id => {
    if (!id) return;
    const p = (battingTeam.players || []).find(x => x.id === id);
    if (p) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = `${p.name} (${id === activeMatch.strikerId ? 'Striker' : 'Non-Striker'})`;
      outSelect.appendChild(opt);
    }
  });

  const fielderSelect = document.getElementById('fielderId');
  fielderSelect.innerHTML = '<option value="">None</option>';
  (bowlingTeam.players || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.innerText = p.name;
    fielderSelect.appendChild(opt);
  });

  document.getElementById('wicketModal').classList.add('active');
}

function closeWicketModal() {
  document.getElementById('wicketModal').classList.remove('active');
}

function submitWicket() {
  const wicketType = document.getElementById('wicketType').value;
  const outPlayerId = document.getElementById('outPlayerId').value;
  const fielderId = document.getElementById('fielderId').value;

  const ball = {
    runs: 0,
    extrasType: 'NONE',
    extraRuns: 0,
    wicketType,
    outPlayerId,
    fielderId: fielderId || null,
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  activeMatch.ballHistory = [...(activeMatch.ballHistory || []), ball];
  closeWicketModal();
  activeMatch = recalculateMatch(activeMatch);
  render();
}

function undoLastBall() {
  if (!activeMatch || !activeMatch.ballHistory || activeMatch.ballHistory.length === 0) return;
  activeMatch.ballHistory.pop();
  activeMatch = recalculateMatch(activeMatch);
  render();
}

function createNewMatch() {
  const teamAName = document.getElementById('teamAName').value || 'Rockets';
  const teamAColor = document.getElementById('teamAColor').value || '#FF5722';
  const teamAPlayersStr = document.getElementById('teamAPlayers').value || 'Alice, Bob, Charlie';

  const teamBName = document.getElementById('teamBName').value || 'Thunder';
  const teamBColor = document.getElementById('teamBColor').value || '#2196F3';
  const teamBPlayersStr = document.getElementById('teamBPlayers').value || 'Eve, Frank, Grace';

  const overs = parseInt(document.getElementById('matchOvers').value) || 5;

  const teamA = {
    id: 'team_a_' + Date.now(),
    name: teamAName,
    colorHex: teamAColor,
    players: teamAPlayersStr.split(',').map((n, i) => ({
      id: `pa_${i}_${Date.now()}`,
      name: n.trim(),
      battingStats: { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, isRetiredHurt: false, wicketType: 'NONE' },
      bowlingStats: { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0, dotBalls: 0, wides: 0, noBalls: 0 },
      fieldingStats: { catches: 0, runOuts: 0, stumpings: 0, droppedCatches: 0 }
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
      bowlingStats: { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0, dotBalls: 0, wides: 0, noBalls: 0 },
      fieldingStats: { catches: 0, runOuts: 0, stumpings: 0, droppedCatches: 0 }
    }))
  };

  activeMatch = {
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
    wicketHistory: [],
    gullyRules: {},
    pendingAction: 'NONE'
  };

  closeNewMatchModal();
  activeMatch = recalculateMatch(activeMatch);
  render();
}

function openNewMatchModal() {
  document.getElementById('newMatchModal').classList.add('active');
}

function closeNewMatchModal() {
  document.getElementById('newMatchModal').classList.remove('active');
}

function openScorecardModal() {
  if (!activeMatch) return;
  const content = document.getElementById('scorecardContent');
  content.innerHTML = `
    <h4>Wicket History</h4>
    <ul style="padding-left:16px; margin-top:8px;">
      ${(activeMatch.wicketHistory || []).map(w => `<li>${w.over} - ${w.batterName} (${w.wicketType}) - Score: ${w.totalRuns}</li>`).join('') || '<li>No wickets yet</li>'}
    </ul>
  `;
  document.getElementById('scorecardModal').classList.add('active');
}

function closeScorecardModal() {
  document.getElementById('scorecardModal').classList.remove('active');
}

function saveActiveMatch() {
  if (activeMatch) {
    localStorage.setItem('cricscore_active_match', JSON.stringify(activeMatch));
  }
}

function loadSavedMatch() {
  const saved = localStorage.getItem('cricscore_active_match');
  if (saved) {
    try {
      activeMatch = JSON.parse(saved);
      activeMatch = recalculateMatch(activeMatch);
      render();
    } catch (e) {
      console.error('Failed to parse saved match', e);
    }
  } else {
    createNewMatch();
  }
}

// Initialize App
loadSavedMatch();
