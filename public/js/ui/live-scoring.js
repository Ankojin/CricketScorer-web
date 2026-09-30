// Live scoring UI and scoring interactions.
let lastCelebratedResultToken = null;

function closeMatchResultModal() {
  const modal = document.getElementById('matchResultModal');
  if (modal) modal.classList.remove('active');
}

function maybeShowMatchResultCelebration(match) {
  if (!match || match.status !== 'COMPLETED') return;

  const resultToken = `${match.id || ''}|${match.status}|${match.winnerId || 'TIE'}|${match.totalRuns || 0}|${match.totalWickets || 0}|${match.updatedAt || ''}`;
  if (resultToken === lastCelebratedResultToken) return;

  const resultText = window.ScoringEngine.getMatchResultString(match);
  const winnerName = match.winnerId === match.teamA?.id
    ? (match.teamA?.name || 'Team A')
    : match.winnerId === match.teamB?.id
      ? (match.teamB?.name || 'Team B')
      : null;

  const titleEl = document.getElementById('matchResultTitle');
  const bodyEl = document.getElementById('matchResultBody');
  if (!titleEl || !bodyEl) return;

  if (winnerName) {
    titleEl.innerText = `🏆 ${winnerName} won the match!`;
  } else {
    titleEl.innerText = '🤝 Match tied';
  }

  bodyEl.innerText = resultText || 'Match completed';
  openPrimaryActionModal('matchResultModal');
  showToast(winnerName ? `${winnerName} won the match` : 'Match tied', 'success');
  lastCelebratedResultToken = resultToken;
}

function goLiveShare() {
  if (!activeMatch) return;

  if (window.CricStorage && window.CricStorage.isGuestUser()) {
    showToast('Sign in to share live scores across devices', 'warning');
    return;
  }

  if (activeMatch.status !== 'LIVE') {
    showToast('Live link is available only while match is LIVE', 'warning');
    return;
  }

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

    currentScoringMode = activeMatch.scoringMode === 'WEBSCORE'
      ? 'WEBSCORE'
      : activeMatch.scoringMode === 'FULL' ? 'FULL' : 'QUICK';
    activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
    if (activeMatch.scoringMode === 'WEBSCORE') {
      await continueWebScoreParticipants();
    }

    if (isReadOnlySpectator && activeMatch.status !== 'LIVE') {
      showToast('This live link has expired because the match has ended.', 'warning');
      activeMatch = null;
      if (spectatorPollInterval) {
        clearInterval(spectatorPollInterval);
        spectatorPollInterval = null;
      }
      showLandingScreen();
      return;
    }

    if (activeMatch.status === 'UPCOMING') {
      requestPendingAction('TOSS_REQUIRED');
    }
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

function formatBallForTicker(ball) {
  if (!ball) return 'No deliveries yet';
  if (ball.isAdjustment && ball.adjustmentSlot === 'SWAP') return 'Manual correction: striker/non-striker swapped';
  if (ball.wicketType && ball.wicketType !== 'NONE') {
    if (ball.wicketType === 'RETIRED_HURT') return 'Retired hurt recorded';
    return `Wicket: ${ball.wicketType.replace(/_/g, ' ')}`;
  }
  if (ball.isDroppedCatch || ball.wasDroppedCatch) {
    return `Dropped catch: ${ball.runs || 0} run${(ball.runs || 0) === 1 ? '' : 's'} completed`;
  }
  if (ball.extrasType === 'WIDE') return `Wide +${ball.extraRuns ?? 1}`;
  if (ball.extrasType === 'NO_BALL') return `No ball +${(ball.runs || 0) + (ball.extraRuns || 1)}`;
  if (ball.extrasType === 'BYE') return `Bye +${ball.extraRuns ?? 0}`;
  if (ball.extrasType === 'LEG_BYE') return `Leg bye +${ball.extraRuns ?? 0}`;
  if (ball.extrasType === 'GRANTED') return 'Granted single recorded';
  if ((ball.runs || 0) === 0) return 'Dot ball';
  return `Runs: ${ball.runs || 0}`;
}

function getLiveTickerMessage(match) {
  if (!match) return 'Ready to score';
  if (match.status === 'UPCOMING') return 'Match setup in progress: complete toss and decision';
  if (match.status === 'ABANDONED') return 'Match abandoned: resume from settings to continue';
  if (match.status === 'COMPLETED') return 'Match completed: review scorecard and stats';
  if (match.pendingAction && match.pendingAction !== 'NONE') {
    return `Action required: ${match.pendingAction.replace(/_/g, ' ')}`;
  }

  const history = match.ballHistory || [];
  const lastBall = history.length > 0 ? history[history.length - 1] : null;
  return formatBallForTicker(lastBall);
}

function getLiveThisOverData(match) {
  const history = match.ballHistory || [];
  const inningsStart = match.currentInnings === 2
    ? Math.min(match.innings1Data?.recordedBallsCount || 0, history.length)
    : 0;
  const inningsHistory = history.slice(inningsStart);
  const totalBalls = match.totalBalls || 0;
  const ballsIntoOver = totalBalls % 6;
  const isPhysicalBall = ball => window.ScoringEngine?.isPhysicalBall
    ? window.ScoringEngine.isPhysicalBall(ball)
    : !ball.isAdjustment && ball.extrasType !== 'WIDE' && ball.extrasType !== 'NO_BALL' && ball.wicketType !== 'RETIRED_HURT';

  let startIndex = 0;
  let overNumber = Math.floor(totalBalls / 6) + 1;

  if (totalBalls > 0 && ballsIntoOver === 0) {
    let lastPhysicalIndex = -1;
    for (let i = inningsHistory.length - 1; i >= 0; i--) {
      if (isPhysicalBall(inningsHistory[i])) {
        lastPhysicalIndex = i;
        break;
      }
    }

    if (lastPhysicalIndex >= 0 && lastPhysicalIndex < inningsHistory.length - 1) {
      startIndex = lastPhysicalIndex + 1;
    } else {
      overNumber = Math.max(1, totalBalls / 6);
      let seenPhysicalBalls = 0;
      for (let i = inningsHistory.length - 1; i >= 0; i--) {
        if (isPhysicalBall(inningsHistory[i]) && ++seenPhysicalBalls > 6) {
          startIndex = i + 1;
          break;
        }
      }
    }
  } else if (ballsIntoOver > 0) {
    let seenPhysicalBalls = 0;
    for (let i = inningsHistory.length - 1; i >= 0; i--) {
      if (isPhysicalBall(inningsHistory[i]) && ++seenPhysicalBalls > ballsIntoOver) {
        startIndex = i + 1;
        break;
      }
    }
  }

  return { balls: inningsHistory.slice(startIndex), overNumber };
}

function closeLiveMoreMenu() {
  const menu = document.getElementById('liveMoreMenu');
  if (menu) menu.open = false;
}

function renderLiveScoring() {
  window.activeMatch = activeMatch;
  const activeContainer = document.getElementById('liveScoringActiveContainer');
  const emptyContainer = document.getElementById('liveScoringEmptyContainer');
  const activeScreen = document.querySelector('.screen.active')?.id;
  const activeView = activeScreen === 'screenScorecard' ? 'scorecard'
    : activeScreen === 'screenOvers' ? 'overs'
      : activeScreen === 'screenStats' ? 'stats' : 'summary';
  updateMatchHubHeaders(activeView);

  if (!activeMatch) {
    if (activeContainer) activeContainer.style.display = 'none';
    if (emptyContainer) emptyContainer.style.display = 'block';
    return;
  }

  if (activeContainer) activeContainer.style.display = '';
  if (emptyContainer) emptyContainer.style.display = 'none';

  const m = activeMatch;
  const isBattingA = m.battingTeamId === m.teamA?.id;
  const battingTeam = isBattingA ? m.teamA : m.teamB;
  const bowlingTeam = isBattingA ? m.teamB : m.teamA;
  if (isWebScoreMatch(m) && m.pendingAction === 'START_SECOND_INNINGS' && !isReadOnlySpectator) {
    const firstInningsModal = document.getElementById('firstInningsModal');
    if (firstInningsModal && !firstInningsModal.classList.contains('active')) showFirstInningsCompleteModal();
  }

  const teamAColor = m.teamA?.colorHex || '#13a968';
  const teamBColor = m.teamB?.colorHex || '#38bdf8';
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
  const extraScoringActions = document.getElementById('scoringExtraActions');
  const isWebScore = isWebScoreMatch(m);
  const isScoringLockedByStatus = m.status === 'COMPLETED' || m.status === 'ABANDONED';
  const isSingleSideBatting = Boolean(m.gullyRules?.singleSideBatting);
  if (isReadOnlySpectator) {
    if (spectatorBanner) spectatorBanner.style.display = 'block';
    if (scoringKeypad) scoringKeypad.style.display = 'none';
    if (goLiveBtn) goLiveBtn.style.display = 'none';
    if (btnSwapBatsmen) btnSwapBatsmen.style.display = 'none';
    if (extraScoringActions) extraScoringActions.style.display = 'none';
  } else {
    if (spectatorBanner) spectatorBanner.style.display = 'none';
    if (scoringKeypad) scoringKeypad.style.display = isScoringLockedByStatus ? 'none' : 'grid';
    if (goLiveBtn) goLiveBtn.style.display = isScoringLockedByStatus ? 'none' : 'flex';
    if (extraScoringActions) extraScoringActions.style.display = isScoringLockedByStatus ? 'none' : 'grid';
  }

  // Last Saved Tag
  const lastSavedTag = document.getElementById('lastSavedTag');
  if (lastSavedTag) {
    const timeStr = m.updatedAt ? new Date(m.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
    lastSavedTag.innerText = `Saved ${timeStr}`;
  }

  // Toggle UI elements for QUICK mode vs FULL mode during live scoring
  const isQuickMode = (m.scoringMode === 'QUICK') || (currentScoringMode === 'QUICK') || isWebScoreMatch(m);
  if (btnSwapBatsmen) {
    btnSwapBatsmen.style.display = isScoringLockedByStatus || isSingleSideBatting || isQuickMode ? 'none' : 'flex';
  }
  const activeScoringContainer = document.getElementById('liveScoringActiveContainer');
  if (activeScoringContainer) activeScoringContainer.classList.toggle('web-score-compact', isWebScore);
  document.querySelectorAll('[data-webscore-extra]').forEach(button => {
    button.style.display = isWebScore ? '' : 'none';
  });
  const battersCard = document.getElementById('liveBattersCard');
  const bowlerCard = document.getElementById('liveBowlerCard');
  const matchTabsNav = document.querySelector('.match-view-tabs');

  if (isQuickMode && activeScreen === 'screenLiveScoring') {
    if (battersCard) battersCard.style.display = 'none';
    if (bowlerCard) bowlerCard.style.display = 'none';
    if (matchTabsNav) matchTabsNav.style.display = 'none';
  } else {
    if (battersCard) battersCard.style.display = '';
    if (bowlerCard) bowlerCard.style.display = '';
    if (matchTabsNav) matchTabsNav.style.display = '';
  }

  // Completed Match Summary Card
  const completedCard = document.getElementById('completedMatchCard');
  if (m.status === 'COMPLETED' || m.status === 'ABANDONED') {
    completedCard.style.display = 'block';
    if (m.status === 'ABANDONED') {
      document.getElementById('winnerTitle').innerText = '⛔ Match Abandoned';
      document.getElementById('marginText').innerHTML = 'Scoring is locked. Resume from Match Settings to continue.';
    } else {
      const resultStr = window.ScoringEngine.getMatchResultString(m);

      // Calculate Man of the Match
      const motm = window.ScoringEngine.calculateMotm(m);
      const motmHtml = motm ? `<div style="font-size:13px; color:var(--color-warning); font-weight:800; margin-top:8px;">🌟 MAN OF THE MATCH: ${motm.player.name.toUpperCase()} (Impact: ${motm.impactScore} pts)</div>` : '';

      document.getElementById('winnerTitle').innerText = resultStr;
      document.getElementById('marginText').innerHTML = `
        <div>Match Completed | ${m.currentInnings === 2 ? 'Target Reached / Innings Ended' : 'Innings Completed'}</div>
        ${motmHtml}
        <div style="margin-top:16px; display:flex; gap:10px; justify-content:center;">
          <button class="cric-btn cric-btn-primary" style="padding:10px 20px; font-size:13px; min-height:42px;" onclick="showLandingScreen()">Done / Home</button>
          <button class="cric-btn cric-btn-secondary" style="padding:10px 20px; font-size:13px; min-height:42px;" onclick="showScorecardScreen()">View Scorecard</button>
        </div>
      `;
    }
  } else {
    completedCard.style.display = 'none';
    lastCelebratedResultToken = null;
  }

  if (m.status === 'COMPLETED') {
    maybeShowMatchResultCelebration(m);
  }

  // Header Match Info & Team Accents
  const tossWinner = m.tossWinnerId === m.teamA?.id ? m.teamA?.name : (m.tossWinnerId === m.teamB?.id ? m.teamB?.name : null);
  const tossStr = tossWinner ? ` · ${tossWinner} opt to ${m.tossDecision?.toLowerCase()}` : '';

  const scoringHeader = document.getElementById('scoringHeader');
  if (scoringHeader) {
    scoringHeader.innerHTML = `
      <div style="margin-bottom:8px;">
        <span style="background:${battingTeamColor}; color:var(--color-text-on-dark); font-size:11px; font-weight:800; padding:3px 10px; border-radius:12px; display:inline-block; letter-spacing:0.5px; box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏏 ${battingTeam?.name?.toUpperCase() || ''} BATTING</span>
      </div>
      <div class="live-score-team-row" style="font-size:16px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px;">
        <span style="color:${teamAColor}; border-bottom:2px solid ${teamAColor}; padding-bottom:1px; display:inline-flex; align-items:center; gap:4px;">
          <span class="team-badge" style="background:${teamAColor};"></span>${m.teamA?.name || 'Team A'}
        </span>
        <span style="color:var(--text-muted); font-size:12px;">vs</span>
        <span style="color:${teamBColor}; border-bottom:2px solid ${teamBColor}; padding-bottom:1px; display:inline-flex; align-items:center; gap:4px;">
          <span class="team-badge" style="background:${teamBColor};"></span>${m.teamB?.name || 'Team B'}
        </span>
      </div>
      <button id="goLiveBtn" class="score-header-live-button" type="button" onclick="goLiveShare()"><span aria-hidden="true">●</span> LIVE</button>
      <div style="font-size:12px; color:var(--text-muted); font-weight:600; margin-top:6px;">
        Batting: <span style="color:${battingTeamColor}; font-weight:800;">${battingTeam?.name || ''}</span>${tossStr}
      </div>
    `;
  }

  // Score Main Accent
  const scoreMainEl = document.getElementById('scoreMain');
  if (scoreMainEl) {
    scoreMainEl.innerText = `${m.totalRuns || 0}/${m.totalWickets || 0}`;
    scoreMainEl.style.color = 'var(--color-text)';
  }

  const overStr = `${Math.floor((m.totalBalls || 0) / 6)}.${(m.totalBalls || 0) % 6}`;
  const powerplayLabel = m.powerplayOvers
    ? ((m.totalBalls || 0) < m.powerplayOvers * 6
      ? ` | PP ON (${m.powerplayOvers} ov)`
      : ` | PP DONE (${m.powerplayOvers} ov)`)
    : '';
  document.getElementById('oversText').innerText = `Overs: ${overStr} / ${m.oversPerInnings || 20}${powerplayLabel}`;

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

  // This-over ball chips
  const recentContainer = document.getElementById('recentBalls');
  recentContainer.innerHTML = '';
  const thisOver = getLiveThisOverData(m);
  const thisOverLabel = document.getElementById('thisOverLabel');
  if (thisOverLabel) thisOverLabel.innerText = `Over ${thisOver.overNumber}`;

  thisOver.balls.forEach(b => {
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
    } else if (b.extrasType === 'GRANTED' || (b.runs === 1 && b.rotateStrike === false)) {
      div.classList.add('extra');
      div.innerText = '1G';
    } else if (b.extrasType === 'WIDE') {
      div.classList.add('extra');
      div.innerText = `${b.extraRuns ?? 1}WD`;
    } else if (b.extrasType === 'NO_BALL') {
      div.classList.add('extra');
      const total = (b.runs || 0) + (b.extraRuns || 1);
      div.innerText = total > 1 ? `${total}NB` : 'NB';
    } else if (b.extrasType === 'BYE') {
      div.classList.add('extra');
      div.innerText = `${b.extraRuns ?? 0}B`;
    } else if (b.extrasType === 'LEG_BYE') {
      div.classList.add('extra');
      div.innerText = `${b.extraRuns ?? 0}LB`;
    } else if (b.runs === 4) {
      div.classList.add('four');
      div.innerText = '4';
    } else if (b.runs === 6) {
      div.classList.add('six');
      div.innerText = '6';
    } else {
      div.innerText = b.runs || 0;
    }
    recentContainer.appendChild(div);
  });

  const liveTickerText = document.getElementById('liveTickerText');
  if (liveTickerText) {
    liveTickerText.innerText = getLiveTickerMessage(m);
  }

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

  const batterRows = isSingleSideBatting
    ? [{ player: striker, isStriker: true, role: 'STRIKER' }]
    : [
        { player: striker, isStriker: true, role: 'STRIKER' },
        { player: nonStriker, isStriker: false, role: 'NON_STRIKER' }
      ];

  batterRows.forEach(({ player: p, isStriker, role }) => {
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
        <button class="edit-player-btn" onclick="requestPendingAction('REPLACE_${role}')" title="Change ${isStriker ? 'Striker' : 'Non-Striker'}">✏️</button>
      `;

      tr.innerHTML = `
        <td class="live-player-name-cell" style="font-weight:700;">
          <div style="display:flex; align-items:center; gap:2px;">
            <span>${p.name}</span>
            ${isC ? '<span class="badge-c">(C)</span>' : ''}
            ${isVC ? '<span class="badge-vc">(VC)</span>' : ''}
            ${isStriker ? '<span class="striker-star">*</span>' : ''}
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
        <button class="btn-primary" style="width:auto; padding:2px 8px; font-size:11px;" onclick="requestPendingAction('SELECT_${role}')">Select ${isStriker ? 'Striker' : 'Non-Striker'}</button>
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
      <button class="edit-player-btn" onclick="requestPendingAction('REPLACE_BOWLER')" title="Change Bowler">✏️</button>
    `;

    tr.innerHTML = `
      <td class="live-player-name-cell" style="font-weight:700;">
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
      <button class="btn-primary" style="width:auto; padding:2px 8px; font-size:11px;" onclick="requestPendingAction('SELECT_BOWLER')">Select Bowler</button>
    `;
    bowlerBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:10px;">Select Bowler ${editBtn}</td></tr>`;
  }

  // Action Prompt Banner
  const actionBanner = document.getElementById('actionBanner');
  if (!isWebScoreMatch(m) && m.status === 'LIVE' && m.pendingAction && m.pendingAction !== 'NONE' && !isReadOnlySpectator) {
    actionBanner.style.display = 'block';
    actionBanner.innerText = `Pending Action: ${m.pendingAction.replace(/_/g, ' ')}`;

    const selectionModal = document.getElementById('selectionModal');
    const overEndModal = document.getElementById('overEndModal');
    const isSelectionOpen = selectionModal && selectionModal.classList.contains('active');
    const isOverEndOpen = overEndModal && overEndModal.classList.contains('active');
    if (!isSelectionOpen && !isOverEndOpen) {
      promptPendingAction(m.pendingAction);
    }
  } else {
    actionBanner.style.display = 'none';
  }
}

function ensureMatchLiveForScoring() {
  if (!activeMatch || isReadOnlySpectator) return false;
  if (activeMatch.status === 'ABANDONED') {
    showToast('Match is ABANDONED. Resume it from Match Settings to continue scoring.', 'warning');
    return false;
  }
  if (activeMatch.status === 'COMPLETED') {
    showToast('Match is already completed. Create a new match to continue scoring.', 'warning');
    return false;
  }
  return true;
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
  const modal = document.getElementById('firstInningsModal');
  if (modal) modal.classList.remove('active');
  if (activeMatch.currentInnings !== 2 || !activeMatch.innings1Data) return;
  activeMatch.isSecondInningsStarted = true;
  if (isWebScoreMatch(activeMatch)) {
    const battingTeam = activeMatch.battingTeamId === activeMatch.teamA?.id ? activeMatch.teamA : activeMatch.teamB;
    const bowlingTeam = activeMatch.battingTeamId === activeMatch.teamA?.id ? activeMatch.teamB : activeMatch.teamA;
    activeMatch.strikerId = battingTeam?.players?.[0]?.id || null;
    activeMatch.nonStrikerId = battingTeam?.players?.[1]?.id || null;
    activeMatch.currentBowlerId = chooseWebScoreBowler(activeMatch, bowlingTeam)?.id || bowlingTeam?.players?.[0]?.id || null;
    activeMatch.pendingAction = 'NONE';
  } else {
    activeMatch.pendingAction = 'SELECT_STRIKER';
  }

  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  activeMatch = await window.CricStorage.saveMatch(activeMatch);
  showToast(isWebScoreMatch(activeMatch)
    ? `Second innings started. Target: ${activeMatch.target} runs.`
    : 'Innings 2 Started! Please select 2nd Innings Striker', 'info');
  renderLiveScoring();
}

function promptPendingAction(action) {
  if (isWebScoreMatch() && isSelectionPendingAction(action)) return;
  if (action === 'START_SECOND_INNINGS') {
    const overEndModal = document.getElementById('overEndModal');
    if (overEndModal && overEndModal.classList.contains('active')) return;
    showFirstInningsCompleteModal();
  } else if (action === 'SELECT_STRIKER' || action === 'REPLACE_STRIKER') {
    openPlayerSelection('STRIKER');
  } else if (action === 'SELECT_NON_STRIKER' || action === 'REPLACE_NON_STRIKER') {
    openPlayerSelection('NON_STRIKER');
  } else if (action === 'SELECT_BOWLER' || action === 'REPLACE_BOWLER') {
    openPlayerSelection('BOWLER');
  } else if (action === 'SELECT_FIELDER_DROPPED_CATCH') {
    openDroppedCatchModal();
  } else if (action === 'SELECT_RUNS_DROPPED_CATCH') {
    if (pendingDropFielderId) openPrimaryActionModal('droppedCatchRunsModal');
    else openDroppedCatchModal();
  } else if (action === 'SELECT_FIELDER') {
    if (pendingFielderWicketType) openFielderModal(pendingFielderWicketType);
    else openWicketModal();
  } else if (action === 'SELECT_RUNS_WICKET') {
    openRunOutModal();
  } else if (action === 'SELECT_WK_A') {
    showToast('Please select Team A wicket-keeper in Match Settings', 'warning');
    const modal = document.getElementById('matchSettingsModal');
    if (!modal || !modal.classList.contains('active')) openMatchSettingsModal();
  } else if (action === 'SELECT_WK_B') {
    showToast('Please select Team B wicket-keeper in Match Settings', 'warning');
    const modal = document.getElementById('matchSettingsModal');
    if (!modal || !modal.classList.contains('active')) openMatchSettingsModal();
  } else if (action === 'SELECT_MATCH_SETTINGS') {
    const modal = document.getElementById('matchSettingsModal');
    if (!modal || !modal.classList.contains('active')) openMatchSettingsModal();
  } else if (action === 'TOSS_REQUIRED') {
    const modal = document.getElementById('tossModal');
    if (!modal || !modal.classList.contains('active')) openTossModal();
  }
}

function showFirstInningsCompleteModal() {
  if (!activeMatch?.innings1Data) return;
  const first = activeMatch.innings1Data;
  const battingTeam = [activeMatch.teamA, activeMatch.teamB].find(team => team?.id === first.teamId);
  const bowlingTeam = [activeMatch.teamA, activeMatch.teamB].find(team => team?.id !== first.teamId);
  const score = `${first.runs || 0}/${first.wickets || 0}`;
  const overs = `${Math.floor((first.balls || 0) / 6)}.${(first.balls || 0) % 6}`;
  const isWebScore = activeMatch.scoringMode === 'WEBSCORE';
  const modalOverlay = document.getElementById('firstInningsModal');
  const icon = document.getElementById('firstInningsIcon');
  const heading = modalOverlay?.querySelector('h3');
  const startButton = document.getElementById('startSecondInningsBtn');
  modalOverlay?.classList.toggle('web-score-innings-break', isWebScore);
  if (icon) icon.hidden = isWebScore;
  if (heading) heading.hidden = isWebScore;
  if (startButton) startButton.textContent = isWebScore
    ? `Start ${bowlingTeam?.name || 'Second Team'}’s innings`
    : 'Start Second Innings';

  const summary = document.getElementById('firstInningsSummary');
  if (summary) {
    const target = activeMatch.target || (Number(first.runs || 0) + 1);
    if (isWebScore) {
      summary.innerHTML = `
        <div class="web-score-innings-badge">INNINGS BREAK</div>
        <div class="web-score-innings-team">${battingTeam?.name || 'Team A'} scored</div>
        <div class="web-score-innings-total"><strong>${first.runs || 0}</strong><span>/${first.wickets || 0}</span></div>
        <div class="web-score-innings-overs">in ${overs} overs</div>
        <div class="web-score-target-panel">
          <div>${bowlingTeam?.name || 'Team B'} need</div>
          <strong>${target}</strong>
          <span>to win off ${activeMatch.oversPerInnings || 20} overs</span>
        </div>
      `;
    } else {
      summary.innerHTML = `
        <div style="font-size:16px; font-weight:800; margin-bottom:8px;">${battingTeam?.name || 'Batting team'}: ${score} (${overs} overs)</div>
        <div style="font-size:14px; color:var(--text-muted);">${bowlingTeam?.name || 'Chasing team'} need <strong style="color:var(--color-text-on-dark);">${target}</strong> runs to win.</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:6px;">Target: ${target}</div>
      `;
    }
  }
  openPrimaryActionModal('firstInningsModal');
}

function setPendingAction(action) {
  if (!activeMatch) return;
  activeMatch.pendingAction = action || 'NONE';
}

function clearPendingAction(expectedAction = null) {
  if (!activeMatch) return;
  if (!expectedAction || activeMatch.pendingAction === expectedAction) {
    activeMatch.pendingAction = 'NONE';
  }
}

function requestPendingAction(action) {
  if (!activeMatch || isReadOnlySpectator) return;
  setPendingAction(action);
  promptPendingAction(action);
}

function getBowlingTeamWicketKeeperId(match) {
  if (!match) return null;
  const isBowlingA = match.bowlingTeamId === match.teamA?.id;
  return isBowlingA ? (match.teamAWicketKeeperId || null) : (match.teamBWicketKeeperId || null);
}

function getBowlingTeamWicketKeeperPendingAction(match) {
  if (!match) return 'SELECT_MATCH_SETTINGS';
  const isBowlingA = match.bowlingTeamId === match.teamA?.id;
  return isBowlingA ? 'SELECT_WK_A' : 'SELECT_WK_B';
}

function isSelectionPendingAction(action) {
  return action === 'SELECT_STRIKER'
    || action === 'REPLACE_STRIKER'
    || action === 'SELECT_NON_STRIKER'
    || action === 'REPLACE_NON_STRIKER'
    || action === 'SELECT_BOWLER'
    || action === 'REPLACE_BOWLER';
}

function closeSelectionModal(options = {}) {
  const modal = document.getElementById('selectionModal');
  if (modal) modal.classList.remove('active');

  const clearPending = options && options.clearPending === true;
  if (clearPending && activeMatch && isSelectionPendingAction(activeMatch.pendingAction)) {
    clearPendingAction();
  }
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

    const allBowlers = (bowlingTeam?.players || []);
    const strictEligible = allBowlers.filter(p => getBowlerSelectionBlockers(m, p).length === 0);
    const allowFallback = strictEligible.length === 0;

    allBowlers.forEach(p => {
      const isLastBowler = p.id === m.lastBowlerId;
      const isCurrent = p.id === m.currentBowlerId;
      const stats = p.bowlingStats || { overs: 0, balls: 0, runsConceded: 0, wickets: 0 };
      const blockers = getBowlerSelectionBlockers(m, p);
      const isDisabled = blockers.length > 0 && !allowFallback;

      const item = document.createElement('div');
      item.className = `bowler-option ${isDisabled ? 'disabled' : ''}`;
      if (!isDisabled) {
        item.onclick = () => selectBowlerDirect(p.id);
      } else {
        item.onclick = () => {
          if (blockers[0]) {
            showToast(getBowlerDisableReasonMessage(p.name, blockers[0], m), 'warning');
          }
        };
      }

      let tag = '';
      if (isCurrent) tag = '<span style="font-size:10px; color:var(--color-info); margin-left:4px;">(Current)</span>';
      else if (allowFallback && blockers.length > 0) tag = '<span style="font-size:10px; color:var(--color-warning); margin-left:4px;">(Fallback Allowed)</span>';
      else if (isLastBowler && isDisabled) tag = '<span style="font-size:10px; color:var(--color-error); margin-left:4px;">(Last Bowler)</span>';
      else if (blockers.includes('quota-complete')) tag = '<span style="font-size:10px; color:var(--color-error); margin-left:4px;">(Quota Completed)</span>';
      else if (blockers.includes('quota-bowlers-count')) tag = '<span style="font-size:10px; color:var(--color-error); margin-left:4px;">(Quota Bowlers Limit)</span>';

      item.innerHTML = `
        <div>
          <div style="font-weight:700; color:var(--color-text); display:flex; align-items:center;">${p.name} ${tag}</div>
          <div style="font-size:11px; color:var(--text-muted);">${stats.overs}.${stats.balls} Ov | ${stats.runsConceded} Runs | ${stats.wickets} Wkts</div>
        </div>
        <button class="btn-primary" style="width:auto; padding:6px 12px; font-size:12px;" ${isDisabled ? 'disabled' : ''} onclick="event.stopPropagation(); selectBowlerDirect('${p.id}')">Select</button>
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

    const allowSwitchMidMatch = Boolean(m.gullyRules?.playersSwitchMidMatch);
    const switchCandidates = allowSwitchMidMatch
      ? (bowlingTeam?.players || []).filter(p => {
          if (!p) return false;
          if (p.id === otherId) return false;
          if (p.battingStats?.isOut) return false;
          if (p.battingStats?.isRetiredHurt) return false;
          const existsInBatting = (battingTeam?.players || []).some(bp => bp.id === p.id || bp.name?.toLowerCase() === p.name?.toLowerCase());
          return !existsInBatting;
        })
      : [];

    if (available.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.innerText = 'No available batters';
      select.appendChild(opt);
      confirmBtn.disabled = switchCandidates.length === 0;

      if (switchCandidates.length > 0) {
        const separator = document.createElement('option');
        separator.value = '';
        separator.disabled = true;
        separator.innerText = '──────────';
        select.appendChild(separator);

        switchCandidates.forEach((p, index) => {
          const sw = document.createElement('option');
          sw.value = `SWITCH::${p.id}`;
          sw.innerText = `${p.name} (Switch from ${bowlingTeam?.name || 'Bowling Team'})`;
          if (index === 0) sw.selected = true;
          select.appendChild(sw);
        });
      }

      if (m.gullyRules?.playersJoinMidMatch) {
        const joinBox = document.createElement('div');
        joinBox.style.cssText = 'margin-top:10px; padding:10px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-surface-soft);';
        joinBox.innerHTML = '<div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">No batter available. Mid-match join is enabled.</div>';
        const addBtn = document.createElement('button');
        addBtn.className = 'btn-primary';
        addBtn.style.cssText = 'width:auto; padding:8px 12px; font-size:12px;';
        addBtn.innerText = 'Add New Batter';
        addBtn.onclick = () => addMidMatchPlayerForSelection();
        joinBox.appendChild(addBtn);
        bowlerContainer.appendChild(joinBox);
      }
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

      if (switchCandidates.length > 0) {
        const separator = document.createElement('option');
        separator.value = '';
        separator.disabled = true;
        separator.innerText = '──────────';
        select.appendChild(separator);

        switchCandidates.forEach(p => {
          const opt = document.createElement('option');
          opt.value = `SWITCH::${p.id}`;
          opt.innerText = `${p.name} (Switch from ${bowlingTeam?.name || 'Bowling Team'})`;
          select.appendChild(opt);
        });
      }
    }
  }

  openPrimaryActionModal('selectionModal');
}

function ensureScoringPlayersSelected() {
  if (!activeMatch || isReadOnlySpectator) return false;
  if (!ensureMatchLiveForScoring()) return false;

  if (isWebScoreMatch()) {
    activeMatch.pendingAction = 'NONE';
    return true;
  }

  if (activeMatch.pendingAction && activeMatch.pendingAction !== 'NONE') {
    showToast('Action required: ' + activeMatch.pendingAction.replace(/_/g, ' '), 'warning');
    promptPendingAction(activeMatch.pendingAction);
    return false;
  }

  if (!activeMatch.strikerId) {
    showToast('Please select Striker first', 'warning');
    requestPendingAction('SELECT_STRIKER');
    return false;
  }
  const isBattingA = activeMatch.battingTeamId === activeMatch.teamA?.id;
  const battingTeam = isBattingA ? activeMatch.teamA : activeMatch.teamB;
  const squadSize = (battingTeam?.players || []).length;
  const needsNonStriker = activeMatch.gullyRules?.singleSideBatting
    ? false
    : activeMatch.gullyRules?.lastManStanding
    ? activeMatch.totalWickets < squadSize - 1
    : true;
  if (needsNonStriker && !activeMatch.nonStrikerId) {
    showToast('Please select Non-Striker first', 'warning');
    requestPendingAction('SELECT_NON_STRIKER');
    return false;
  }
  if (!activeMatch.currentBowlerId) {
    showToast('Please select Bowler first', 'warning');
    requestPendingAction('SELECT_BOWLER');
    return false;
  }
  return true;
}

function requiresNonStriker(match) {
  if (!match) return true;
  if (match.gullyRules?.singleSideBatting) return false;
  const isBattingA = match.battingTeamId === match.teamA?.id;
  const battingTeam = isBattingA ? match.teamA : match.teamB;
  const squadSize = (battingTeam?.players || []).length;
  return match.gullyRules?.lastManStanding
    ? match.totalWickets < squadSize - 1
    : true;
}

function nextPendingSelectionAction(match) {
  if (!match) return 'NONE';
  if (!match.strikerId) return 'SELECT_STRIKER';
  if (requiresNonStriker(match) && !match.nonStrikerId) return 'SELECT_NON_STRIKER';
  if (!match.currentBowlerId) return 'SELECT_BOWLER';
  return 'NONE';
}

function getBowlerQuotaCap(match) {
  if (!match) return 0;
  const quotaCap = Number(match.quotaMaxOvers || 0);
  if (quotaCap > 0) return quotaCap;
  const maxCap = Number(match.maxOversPerBowler || 0);
  return maxCap > 0 ? maxCap : 0;
}

function getCurrentBowlingTeam(match) {
  if (!match) return null;
  return match.battingTeamId === match.teamA?.id ? match.teamB : match.teamA;
}

function getUsedBowlerIdsForCurrentInnings(match, bowlingTeam) {
  if (!match || !bowlingTeam) return new Set();
  const teamPlayerIds = new Set((bowlingTeam.players || []).map(p => p.id));
  const history = match.ballHistory || [];
  const splitIdx = match.innings1Data?.recordedBallsCount || history.length;
  const inningsHistory = match.currentInnings === 2 ? history.slice(splitIdx) : history.slice(0, splitIdx);
  const used = new Set();
  inningsHistory.forEach(b => {
    if (b?.bowlerId && teamPlayerIds.has(b.bowlerId)) {
      used.add(b.bowlerId);
    }
  });
  return used;
}

function getBowlerSelectionBlockers(match, bowler) {
  const blockers = [];
  if (!match || !bowler) {
    blockers.push('invalid');
    return blockers;
  }

  const bowlingTeam = getCurrentBowlingTeam(match);
  const usedBowlerIds = getUsedBowlerIdsForCurrentInnings(match, bowlingTeam);
  const quotaBowlersCount = Number(match.quotaBowlersCount || 0);
  const quotaCap = getBowlerQuotaCap(match);
  const stats = bowler.bowlingStats || { overs: 0, balls: 0 };
  const reachedQuota = quotaCap > 0 && (stats.overs || 0) >= quotaCap;

  if (bowler.id === match.lastBowlerId) {
    blockers.push('last-bowler');
  }
  if (reachedQuota) {
    blockers.push('quota-complete');
  }
  if (quotaBowlersCount > 0 && !usedBowlerIds.has(bowler.id) && usedBowlerIds.size >= quotaBowlersCount) {
    blockers.push('quota-bowlers-count');
  }

  return blockers;
}

function getBowlerDisableReasonMessage(bowlerName, blocker, match) {
  if (blocker === 'quota-complete') {
    return `${bowlerName} has completed maximum quota (${getBowlerQuotaCap(match)} overs)`;
  }
  if (blocker === 'last-bowler') {
    return `${bowlerName} bowled the previous over`;
  }
  if (blocker === 'quota-bowlers-count') {
    return `Only ${match.quotaBowlersCount} bowlers allowed by quota`;
  }
  return `${bowlerName} cannot bowl now`;
}

function canSelectBowlerNow(match, bowlerId) {
  const bowlingTeam = getCurrentBowlingTeam(match);
  const bowler = (bowlingTeam?.players || []).find(p => p.id === bowlerId);
  if (!bowler) return false;

  const blockers = getBowlerSelectionBlockers(match, bowler);
  if (blockers.length === 0) return true;

  // Fallback: If ALL bowlers in the team have blockers, allow selecting any bowler so scoring is never stuck!
  const allBowlers = bowlingTeam?.players || [];
  const strictEligible = allBowlers.filter(p => getBowlerSelectionBlockers(match, p).length === 0);
  if (strictEligible.length === 0) {
    return true;
  }

  const nonLastBowlerBlockers = blockers.filter(b => b !== 'last-bowler');
  if (nonLastBowlerBlockers.length > 0) return false;

  const alternatives = allBowlers.filter(p => {
    const b = getBowlerSelectionBlockers(match, p);
    return b.length === 0 || (b.length === 1 && b[0] === 'last-bowler');
  });

  return alternatives.length <= 1;
}

async function selectBowlerDirect(bowlerId) {
  if (!activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) return;
  if (!canSelectBowlerNow(activeMatch, bowlerId)) {
    const bowlingTeam = getCurrentBowlingTeam(activeMatch);
    const bowler = (bowlingTeam?.players || []).find(p => p.id === bowlerId);
    const blockers = getBowlerSelectionBlockers(activeMatch, bowler);
    if (bowler && blockers[0]) {
      showToast(getBowlerDisableReasonMessage(bowler.name, blockers[0], activeMatch), 'warning');
    } else {
      showToast('Selected bowler is not eligible right now', 'warning');
    }
    return;
  }

  activeMatch.currentBowlerId = bowlerId;
  activeMatch.pendingAction = 'NONE';
  closeSelectionModal();
  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  activeMatch.currentBowlerId = bowlerId;
  activeMatch.pendingAction = 'NONE';
  activeMatch = await window.CricStorage.saveMatch(activeMatch);
  renderLiveScoring();
}

async function confirmPlayerSelection() {
  const select = document.getElementById('selectionDropdown');
  const selectedId = select.value;
  if (!selectedId || !activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) return;

  const slot = currentSelectionType;
  let finalSelectedId = selectedId;

  if (selectedId.startsWith('SWITCH::')) {
    if (!activeMatch.gullyRules?.playersSwitchMidMatch) {
      showToast('Mid-match team switching is disabled', 'warning');
      return;
    }

    const playerId = selectedId.replace('SWITCH::', '');
    const isBattingA = activeMatch.battingTeamId === activeMatch.teamA?.id;
    const battingTeam = isBattingA ? activeMatch.teamA : activeMatch.teamB;
    const bowlingTeam = isBattingA ? activeMatch.teamB : activeMatch.teamA;
    const player = (bowlingTeam?.players || []).find(p => p.id === playerId);

    if (!player) {
      showToast('Selected player not found in bowling team', 'warning');
      return;
    }

    battingTeam.players = battingTeam.players || [];
    bowlingTeam.players = bowlingTeam.players || [];

    bowlingTeam.players = bowlingTeam.players.filter(p => p.id !== player.id);
    if (!battingTeam.players.some(p => p.id === player.id || p.name?.toLowerCase() === player.name?.toLowerCase())) {
      battingTeam.players.push(player);
    }

    if (activeMatch.currentBowlerId === player.id) {
      activeMatch.currentBowlerId = null;
    }

    finalSelectedId = player.id;
    showToast(`${player.name} switched to batting team`, 'info');
  }

  if (slot === 'STRIKER') {
    activeMatch.strikerId = finalSelectedId;
    if (activeMatch.nonStrikerId === finalSelectedId) {
      activeMatch.nonStrikerId = null;
    }
  } else if (slot === 'NON_STRIKER') {
    activeMatch.nonStrikerId = finalSelectedId;
    if (activeMatch.strikerId === finalSelectedId) {
      activeMatch.strikerId = null;
    }
  }

  activeMatch.pendingAction = nextPendingSelectionAction(activeMatch);

  closeSelectionModal();
  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  activeMatch = await window.CricStorage.saveMatch(activeMatch);
  renderLiveScoring();
}

async function addMidMatchPlayerForSelection() {
  if (!activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) return;
  if (!activeMatch.gullyRules?.playersJoinMidMatch) {
    showToast('Mid-match join is disabled in settings', 'warning');
    return;
  }

  const isBattingA = activeMatch.battingTeamId === activeMatch.teamA?.id;
  const battingTeam = isBattingA ? activeMatch.teamA : activeMatch.teamB;
  const name = (window.prompt('Enter new batter name') || '').trim();
  if (!name) return;

  const alreadyExists = (battingTeam?.players || []).some(p => p && p.name?.toLowerCase() === name.toLowerCase());
  if (alreadyExists) {
    showToast(`"${name}" already exists in batting team`, 'warning');
    return;
  }

  battingTeam.players = battingTeam.players || [];
  const playerId = `join_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  battingTeam.players.push({
    id: playerId,
    name,
    role: 'Batter',
    style: 'RHB'
  });

  activeMatch.pendingAction = currentSelectionType === 'NON_STRIKER' ? 'SELECT_NON_STRIKER' : 'SELECT_STRIKER';
  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  activeMatch = await window.CricStorage.saveMatch(activeMatch);
  showToast(`${name} joined the batting team`, 'success');
  openPlayerSelection(currentSelectionType || 'STRIKER');
}

function chooseWebScoreBowler(match, bowlingTeam) {
  const players = bowlingTeam?.players || [];
  const eligible = players.find(player => getBowlerSelectionBlockers(match, player).length === 0);
  if (eligible) return eligible;
  return players.find(player => player.id !== match.lastBowlerId) || players[0] || null;
}

async function continueWebScoreParticipants() {
  if (!activeMatch || isReadOnlySpectator || !isWebScoreMatch(activeMatch) || activeMatch.status !== 'LIVE') return;
  if (activeMatch.pendingAction === 'START_SECOND_INNINGS') return;

  const battingTeam = activeMatch.battingTeamId === activeMatch.teamA?.id ? activeMatch.teamA : activeMatch.teamB;
  const bowlingTeam = activeMatch.battingTeamId === activeMatch.teamA?.id ? activeMatch.teamB : activeMatch.teamA;
  const isAvailableBatter = player => player && player.battingStats?.isOut !== true && player.battingStats?.isRetiredHurt !== true;
  const usedBatterIds = new Set([activeMatch.strikerId, activeMatch.nonStrikerId].filter(Boolean));
  let changed = false;

  if (!isAvailableBatter((battingTeam?.players || []).find(player => player.id === activeMatch.strikerId))) {
    const replacement = (battingTeam?.players || []).find(player => isAvailableBatter(player) && player.id !== activeMatch.nonStrikerId);
    activeMatch.strikerId = replacement?.id || null;
    changed = true;
  }
  if (requiresNonStriker(activeMatch) && !isAvailableBatter((battingTeam?.players || []).find(player => player.id === activeMatch.nonStrikerId))) {
    const replacement = (battingTeam?.players || []).find(player => isAvailableBatter(player) && player.id !== activeMatch.strikerId && !usedBatterIds.has(player.id));
    activeMatch.nonStrikerId = replacement?.id || null;
    changed = true;
  }
  if (!activeMatch.currentBowlerId) {
    activeMatch.currentBowlerId = chooseWebScoreBowler(activeMatch, bowlingTeam)?.id || null;
    changed = true;
  }
  if (changed) {
    activeMatch.pendingAction = 'NONE';
    activeMatch = await window.CricStorage.saveMatch(activeMatch);
  }
}

async function addBallWithWebScoreFlow(ball) {
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  await continueWebScoreParticipants();
  return activeMatch;
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
  activeMatch = await addBallWithWebScoreFlow(ball);

  const newBalls = activeMatch.totalBalls || 0;
  if (newBalls > 0 && newBalls % 6 === 0 && newBalls !== prevBalls) {
    checkAndShowOverEndModal();
  }

  renderLiveScoring();
}

async function addExtra(type) {
  openExtraRunsModal(type);
}

function openExtraRunsModal(type) {
  if (!ensureScoringPlayersSelected()) return;
  pendingExtraType = type;

  const titleEl = document.getElementById('extraRunsTitle');
  const subEl = document.getElementById('extraRunsSubtitle');
  const container = document.getElementById('extraRunsOptionsContainer');

  container.innerHTML = '';

  if (type === 'WIDE') {
    titleEl.innerText = '↔️ WIDE + Extra Runs';
    subEl.innerText = 'Any additional runs taken on the wide?';

    const options = [
      { extraRuns: 0, label: '0 Runs (1WD)' },
      { extraRuns: 1, label: '1 Run (2WD)' },
      { extraRuns: 2, label: '2 Runs (3WD)' },
      { extraRuns: 3, label: '3 Runs (4WD)' },
      { extraRuns: 4, label: '4 Runs (5WD)' }
    ];

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-extra';
      btn.style.fontSize = '12px';
      btn.style.padding = '12px 6px';
      btn.innerText = opt.label;
      btn.onclick = () => submitWideWithRuns(opt.extraRuns);
      container.appendChild(btn);
    });

  } else if (type === 'NO_BALL') {
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
      { extraRuns: 0, label: '0 Runs' },
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

  openPrimaryActionModal('extraRunsModal');
}

function closeExtraRunsModal() {
  document.getElementById('extraRunsModal').classList.remove('active');
}

async function submitNoBallWithRuns(batRuns) {
  if (!activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) return;

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
  await continueWebScoreParticipants();
  renderLiveScoring();
}

async function submitWideWithRuns(extraRunsTaken) {
  if (!activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) return;

  const ball = {
    runs: 0,
    extrasType: 'WIDE',
    extraRuns: 1 + (extraRunsTaken || 0),
    isLegalBall: false,
    rotateStrike: false,
    wicketType: 'NONE',
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  closeExtraRunsModal();
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  await continueWebScoreParticipants();
  renderLiveScoring();
}

async function submitByesWithRuns(type, extraRuns) {
  if (!activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) return;

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
  await continueWebScoreParticipants();

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
    await continueWebScoreParticipants();
    showToast('Batter retired hurt', 'info');
    renderLiveScoring();
  }
}

function openOtherRunsModal() {
  if (!ensureScoringPlayersSelected()) return;
  const customInput = document.getElementById('customOtherRunsInput');
  if (customInput) customInput.value = '';
  openPrimaryActionModal('otherRunsModal');
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

function openDroppedCatchModal() {
  if (!activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) return;

  if (!activeMatch.strikerId) {
    showToast('Please select Striker first', 'warning');
    requestPendingAction('SELECT_STRIKER');
    return;
  }

  if (requiresNonStriker(activeMatch) && !activeMatch.nonStrikerId) {
    showToast('Please select Non-Striker first', 'warning');
    requestPendingAction('SELECT_NON_STRIKER');
    return;
  }

  if (!activeMatch.currentBowlerId) {
    showToast('Please select Bowler first', 'warning');
    requestPendingAction('SELECT_BOWLER');
    return;
  }

  setPendingAction('SELECT_FIELDER_DROPPED_CATCH');

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

  openPrimaryActionModal('droppedCatchFielderModal');
}

function closeDroppedCatchFielderModal(preserveSelection = false) {
  document.getElementById('droppedCatchFielderModal').classList.remove('active');
  if (!preserveSelection) {
    pendingDropFielderId = null;
  }
  clearPendingAction('SELECT_FIELDER_DROPPED_CATCH');
}

function proceedToDroppedCatchRuns() {
  const fielderSelect = document.getElementById('dropFielderSelect');
  const fielderId = fielderSelect ? fielderSelect.value : null;
  if (!fielderId) {
    showToast('Please select a fielder', 'warning');
    return;
  }
  pendingDropFielderId = fielderId;
  setPendingAction('SELECT_RUNS_DROPPED_CATCH');
  closeDroppedCatchFielderModal(true);
  openPrimaryActionModal('droppedCatchRunsModal');
}

function closeDroppedCatchRunsModal() {
  document.getElementById('droppedCatchRunsModal').classList.remove('active');
  pendingDropFielderId = null;
  clearPendingAction('SELECT_RUNS_DROPPED_CATCH');
}

async function submitDroppedCatchWithRuns(runs) {
  if (!pendingDropFielderId || !activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) return;

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

  clearPendingAction();
  closeDroppedCatchRunsModal();

  const prevBalls = activeMatch.totalBalls || 0;
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  await continueWebScoreParticipants();

  const newBalls = activeMatch.totalBalls || 0;
  if (newBalls > 0 && newBalls % 6 === 0 && newBalls !== prevBalls) {
    checkAndShowOverEndModal();
  }

  showToast(`Dropped catch by ${fielderName} recorded (${runs} run${runs !== 1 ? 's' : ''})`, 'info');
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
  await continueWebScoreParticipants();

  const newBalls = activeMatch.totalBalls || 0;
  if (newBalls > 0 && newBalls % 6 === 0 && newBalls !== prevBalls) {
    checkAndShowOverEndModal();
  }

  renderLiveScoring();
}

async function swapBatsmen() {
  if (!activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) return;
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
  if (activeMatch.pendingAction === 'START_SECOND_INNINGS') {
    showFirstInningsCompleteModal();
    return;
  }
  const isWebScore = activeMatch.scoringMode === 'WEBSCORE';

  const titleEl = document.getElementById('overEndTitle');
  const bodyEl = document.getElementById('overEndBody');
  const dismissalsEl = document.getElementById('overEndDismissals');
  const statsEl = document.getElementById('overEndBowlerStats');
  const matchScoresEl = document.getElementById('overEndMatchScores');

  if (!titleEl || !bodyEl) return;

  let inningsBallHistory = activeMatch.ballHistory || [];
  if (activeMatch.currentInnings === 2 && activeMatch.innings1Data) {
    const firstInningsBallCount = Number(activeMatch.innings1Data.recordedBallsCount || 0);
    inningsBallHistory = inningsBallHistory.slice(firstInningsBallCount);
  }
  const summaries = window.ScoringEngine.getOverSummaries({
    ...activeMatch,
    ballHistory: inningsBallHistory
  });
  if (summaries.length === 0) return;

  const lastOver = summaries[summaries.length - 1];
  const isBattingA = activeMatch.battingTeamId === activeMatch.teamA?.id;
  const battingTeam = isBattingA ? activeMatch.teamA : activeMatch.teamB;
  const bowlingTeam = isBattingA ? activeMatch.teamB : activeMatch.teamA;
  const lastBowler = (bowlingTeam?.players || []).find(p => p.id === activeMatch.lastBowlerId);

  titleEl.innerText = `End of Over ${lastOver.overNumber}`;

  if (matchScoresEl) {
    const teamRuns = lastOver.teamTotalRuns ?? activeMatch.totalRuns ?? 0;
    const teamWkts = lastOver.teamTotalWickets ?? activeMatch.totalWickets ?? 0;
    matchScoresEl.innerText = `${battingTeam?.name || 'Batting team'} ${teamRuns}/${teamWkts} (${lastOver.overNumber}.0 ov)`;
    matchScoresEl.style.color = isWebScore ? 'var(--color-text)' : 'var(--color-primary)';
  }

  if (isWebScore) {
    const wickets = Number(lastOver.wickets || 0);
    const wicketText = wickets ? ` + ${wickets} wicket${wickets === 1 ? '' : 's'}` : '';
    bodyEl.innerText = `${lastOver.runs} runs${wicketText} this over`;
  } else {
    bodyEl.innerText = `Runs in Over: ${lastOver.runs}`;
  }

  // Extract dismissals in this over
  if (dismissalsEl) {
    dismissalsEl.hidden = isWebScore;
    let dismissalTexts = [];
    (lastOver.balls || []).forEach(b => {
      if (b.wicketType && b.wicketType !== 'NONE' && b.wicketType !== 'RETIRED_HURT') {
        const dismissedPlayer = (battingTeam?.players || []).find(p => p.id === b.dismissedPlayerId || p.id === b.strikerId);
        const playerTitle = dismissedPlayer?.name || 'Batter';
        const typeTitle = b.wicketType.replace(/_/g, ' ');
        dismissalTexts.push(`${playerTitle} (${typeTitle})`);
      }
    });

    if (dismissalTexts.length > 0) {
      dismissalsEl.innerText = `Dismissal: ${dismissalTexts.join(', ')}`;
      dismissalsEl.style.color = 'var(--color-danger)';
    } else {
      dismissalsEl.innerText = 'Dismissal: None';
      dismissalsEl.style.color = 'var(--text-muted)';
    }
  }

  if (statsEl) {
    statsEl.hidden = isWebScore;
    if (lastBowler) {
      const stats = lastBowler.bowlingStats || { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0 };
      const inningsRuns = lastOver.teamTotalRuns ?? activeMatch.totalRuns ?? 0;
      const inningsWkts = lastOver.teamTotalWickets ?? activeMatch.totalWickets ?? 0;
      statsEl.innerHTML = `${lastBowler.name}: ${stats.overs}.${stats.balls} Ov - ${stats.runsConceded} Runs - ${stats.wickets} Wkts<br><span style="font-size:16px; font-weight:900; color:var(--color-electric);">Innings: ${inningsRuns}/${inningsWkts}</span>`;
    } else {
      statsEl.innerText = '';
    }
  }

  if (!isWebScore && activeMatch.status === 'LIVE' && activeMatch.pendingAction !== 'START_SECOND_INNINGS') {
    // A completed over always requires bowler re-selection for the next over.
    activeMatch.currentBowlerId = null;
    activeMatch.pendingAction = 'SELECT_BOWLER';
  }

  const continueBtn = document.getElementById('overEndContinueBtn');
  if (continueBtn) {
    continueBtn.innerText = 'Continue (Auto-closes in 5s)';
  }

  if (overEndDismissTimer) clearTimeout(overEndDismissTimer);
  openPrimaryActionModal('overEndModal');

  overEndDismissTimer = setTimeout(() => {
    overEndDismissTimer = null;
    closeOverEndModal();
  }, 5000);
}

function closeOverEndModal() {
  if (overEndDismissTimer) {
    clearTimeout(overEndDismissTimer);
    overEndDismissTimer = null;
  }
  const modal = document.getElementById('overEndModal');
  if (modal) {
    modal.classList.remove('active');
  }

  if (activeMatch && !isReadOnlySpectator && activeMatch.status === 'LIVE') {
    // Keep explicit bowler-selection pending action set at over end.
    activeMatch.pendingAction = activeMatch.pendingAction === 'SELECT_BOWLER'
      ? 'SELECT_BOWLER'
      : nextPendingSelectionAction(activeMatch);
  }

  if (activeMatch?.pendingAction && activeMatch.pendingAction !== 'NONE' && !isReadOnlySpectator) {
    promptPendingAction(activeMatch.pendingAction);
  }
}

function getOverGroupsWithIndices(match, indexOffset = 0) {
  const groups = [];
  if (!match || !Array.isArray(match.ballHistory)) return groups;

  let currentBalls = [];
  let overIndex = 1;
  let physical = 0;

  match.ballHistory.forEach((ball, index) => {
    currentBalls.push({ ball, index: index + indexOffset });
    if (window.ScoringEngine.isPhysicalBall(ball)) {
      physical++;
      if (physical === 6) {
        groups.push({ overNumber: overIndex, balls: currentBalls, isPartial: false });
        overIndex++;
        currentBalls = [];
        physical = 0;
      }
    }
  });

  if (currentBalls.length > 0) {
    groups.push({ overNumber: overIndex, balls: currentBalls, isPartial: true });
  }

  return groups;
}

function openEditBallModal(ballIndex) {
  if (!activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) return;
  if (!Array.isArray(activeMatch.ballHistory) || ballIndex < 0 || ballIndex >= activeMatch.ballHistory.length) return;

  const ball = activeMatch.ballHistory[ballIndex];
  if (ball.isAdjustment) {
    showToast('Adjustment balls are not editable yet', 'warning');
    return;
  }

  pendingEditBallIndex = ballIndex;
  document.getElementById('editBallRuns').value = ball.runs ?? 0;
  document.getElementById('editBallExtrasType').value = ball.extrasType || 'NONE';
  document.getElementById('editBallExtraRuns').value = ball.extraRuns ?? 0;
  document.getElementById('editBallWicketType').value = ball.wicketType || 'NONE';
  document.getElementById('editBallIsLegal').checked = ball.isLegalBall !== false;
  document.getElementById('editBallRotateStrike').checked = ball.rotateStrike !== false;
  openPrimaryActionModal('editBallModal');
}

function closeEditBallModal() {
  pendingEditBallIndex = -1;
  document.getElementById('editBallModal').classList.remove('active');
}

async function confirmEditBall() {
  if (!activeMatch || isReadOnlySpectator || pendingEditBallIndex < 0 || !ensureMatchLiveForScoring()) return;

  const editIndex = pendingEditBallIndex;
  const original = activeMatch.ballHistory[editIndex];
  if (!original) return;

  const runs = parseInt(document.getElementById('editBallRuns').value, 10);
  const extraRuns = parseInt(document.getElementById('editBallExtraRuns').value, 10);
  const extrasType = document.getElementById('editBallExtrasType').value;
  const wicketType = document.getElementById('editBallWicketType').value;
  const isLegalBall = document.getElementById('editBallIsLegal').checked;
  const rotateStrike = document.getElementById('editBallRotateStrike').checked;

  const updatedBall = {
    ...original,
    runs: Number.isNaN(runs) ? 0 : runs,
    extraRuns: Number.isNaN(extraRuns) ? 0 : extraRuns,
    extrasType,
    wicketType,
    isLegalBall,
    rotateStrike
  };

  closeEditBallModal();
  activeMatch = await window.CricStorage.updateBall(activeMatch.id, editIndex, updatedBall);
  renderLiveScoring();
  renderOvers();
  showToast('Ball updated', 'success');
}

async function openWicketModal() {
  if (!ensureScoringPlayersSelected()) return;
  if (activeMatch?.scoringMode === 'WEBSCORE') {
    const wicketTypeSelect = document.getElementById('wicketTypeSelect');
    if (wicketTypeSelect) wicketTypeSelect.value = 'BOWLED';
    await submitWicket();
    return;
  }
  openPrimaryActionModal('wicketModal');
}

function closeWicketModal() {
  document.getElementById('wicketModal').classList.remove('active');
}

async function submitWicket() {
  if (!activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) return;
  const type = document.getElementById('wicketTypeSelect').value;

  if (type === 'RETIRED_HURT') {
    closeWicketModal();
    handleRetireBatter();
    return;
  }

  if (type === 'CAUGHT' || type === 'STUMPED') {
    closeWicketModal();
    pendingFielderWicketType = type;

    if (type === 'STUMPED') {
      const wkId = getBowlingTeamWicketKeeperId(activeMatch);
      if (!wkId) {
        requestPendingAction(getBowlingTeamWicketKeeperPendingAction(activeMatch));
        return;
      }
    }

    requestPendingAction('SELECT_FIELDER');
    return;
  }

  if (type === 'RUN_OUT') {
    closeWicketModal();
    pendingRunOutContext = null;
    requestPendingAction('SELECT_RUNS_WICKET');
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
  const prevBalls = activeMatch.totalBalls || 0;
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  await continueWebScoreParticipants();
  if ((activeMatch.totalBalls || 0) > prevBalls && activeMatch.totalBalls % 6 === 0) checkAndShowOverEndModal();
  renderLiveScoring();
}

function openFielderModal(wicketType) {
  if (!activeMatch || isReadOnlySpectator) return;
  pendingFielderWicketType = wicketType;

  const isBattingA = activeMatch.battingTeamId === activeMatch.teamA?.id;
  const bowlingTeam = isBattingA ? activeMatch.teamB : activeMatch.teamA;

  const titleEl = document.getElementById('fielderModalTitle');
  if (titleEl) {
    if (wicketType === 'RUN_OUT') {
      titleEl.innerText = 'Select Fielder (Run Out)';
    } else {
      titleEl.innerText = `Select Fielder (${wicketType === 'CAUGHT' ? 'Catch' : 'Stumping'})`;
    }
  }

  const select = document.getElementById('fielderSelect');
  select.innerHTML = '';

  if (wicketType === 'STUMPED') {
    const wkId = getBowlingTeamWicketKeeperId(activeMatch);
    const wkPlayer = (bowlingTeam?.players || []).find(p => p.id === wkId);
    if (!wkPlayer) {
      showToast('Set wicket-keeper in Match Settings before recording stumping', 'warning');
      requestPendingAction(getBowlingTeamWicketKeeperPendingAction(activeMatch));
      return;
    }

    const opt = document.createElement('option');
    opt.value = wkPlayer.id;
    opt.innerText = `${wkPlayer.name} (WK)`;
    select.appendChild(opt);
  } else {
    (bowlingTeam?.players || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = p.name;
      select.appendChild(opt);
    });
  }

  openPrimaryActionModal('fielderModal');
}

function closeFielderModal() {
  document.getElementById('fielderModal').classList.remove('active');
  clearPendingAction('SELECT_FIELDER');
  pendingFielderWicketType = null;
  pendingRunOutContext = null;
}

async function confirmFielderWicket() {
  const select = document.getElementById('fielderSelect');
  const fielderId = select.value;
  if (!fielderId || !activeMatch || isReadOnlySpectator || !pendingFielderWicketType || !ensureMatchLiveForScoring()) return;

  if (pendingFielderWicketType === 'STUMPED') {
    const wkId = getBowlingTeamWicketKeeperId(activeMatch);
    if (!wkId) {
      showToast('Set wicket-keeper in Match Settings before recording stumping', 'warning');
      requestPendingAction(getBowlingTeamWicketKeeperPendingAction(activeMatch));
      return;
    }
    if (fielderId !== wkId) {
      showToast('Only the selected wicket-keeper can complete a stumping', 'warning');
      return;
    }
  }

  let ball;
  if (pendingFielderWicketType === 'RUN_OUT' && pendingRunOutContext) {
    ball = {
      runs: pendingRunOutContext.runsCompleted,
      extrasType: 'NONE',
      extraRuns: 0,
      wicketType: 'RUN_OUT',
      outPlayerId: pendingRunOutContext.outPlayerId,
      fielderId: fielderId,
      isLegalBall: true,
      strikerId: activeMatch.strikerId,
      nonStrikerId: activeMatch.nonStrikerId,
      bowlerId: activeMatch.currentBowlerId
    };
  } else {
    ball = {
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
  }

  clearPendingAction();
  pendingRunOutContext = null;
  pendingFielderWicketType = null;
  closeFielderModal();
  await window.CricStorage.saveMatch(activeMatch);
  const prevBalls = activeMatch.totalBalls || 0;
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  await continueWebScoreParticipants();
  if ((activeMatch.totalBalls || 0) > prevBalls && activeMatch.totalBalls % 6 === 0) checkAndShowOverEndModal();
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

  const runsSelect = document.getElementById('runOutRunsSelect');
  if (runsSelect) runsSelect.value = '0';

  const fielderSelect = document.getElementById('runOutFielderSelect');
  fielderSelect.innerHTML = '';
  (bowlingTeam?.players || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.innerText = p.name;
    fielderSelect.appendChild(opt);
  });

  openPrimaryActionModal('runOutModal');
}

function closeRunOutModal() {
  const modal = document.getElementById('runOutModal');
  if (modal) modal.classList.remove('active');
  pendingRunOutContext = null;
  clearPendingAction('SELECT_RUNS_WICKET');
}

async function confirmRunOutWicket() {
  const batterSelect = document.getElementById('runOutBatterSelect');
  const runsSelect = document.getElementById('runOutRunsSelect');
  const fielderSelect = document.getElementById('runOutFielderSelect');

  const outPlayerId = batterSelect ? batterSelect.value : '';
  const runsCompleted = parseInt(runsSelect?.value, 10) || 0;
  const fielderId = fielderSelect ? fielderSelect.value : '';

  if (!outPlayerId || !fielderId || !activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) {
    showToast('Choose who is out, the runs completed, and the fielder', 'warning');
    return;
  }

  const ball = {
    runs: runsCompleted,
    extrasType: 'NONE',
    extraRuns: 0,
    wicketType: 'RUN_OUT',
    outPlayerId,
    fielderId,
    isLegalBall: true,
    strikerId: activeMatch.strikerId,
    nonStrikerId: activeMatch.nonStrikerId,
    bowlerId: activeMatch.currentBowlerId
  };

  const modal = document.getElementById('runOutModal');
  if (modal) modal.classList.remove('active');
  pendingRunOutContext = null;
  pendingFielderWicketType = null;
  clearPendingAction('SELECT_RUNS_WICKET');

  const prevBalls = activeMatch.totalBalls || 0;
  await window.CricStorage.saveMatch(activeMatch);
  activeMatch = await window.CricStorage.addBall(activeMatch.id, ball);
  await continueWebScoreParticipants();

  const newBalls = activeMatch.totalBalls || 0;
  if (newBalls > 0 && newBalls % 6 === 0 && newBalls !== prevBalls) {
    checkAndShowOverEndModal();
  }

  renderLiveScoring();
}

async function undoLastBall() {
  if (!activeMatch || isReadOnlySpectator || !ensureMatchLiveForScoring()) return;
  activeMatch = await window.CricStorage.undoBall(activeMatch.id);
  renderLiveScoring();
}

function promptSpectatorStream() {
  closeFeaturesMenu();
  const matchId = prompt('Enter Live Match ID to view stream (e.g. match_123):');
  if (matchId && matchId.trim()) {
    window.location.href = `index.html?matchId=${encodeURIComponent(matchId.trim())}`;
  }
}

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
