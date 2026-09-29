// scorecard UI module.
async function createSnapshotBlobFromElement(element) {
  const rect = element.getBoundingClientRect();
  const width = Math.max(320, Math.ceil(rect.width));
  const height = Math.max(240, Math.ceil(rect.height));

  const cloned = element.cloneNode(true);
  const wrap = document.createElement('div');
  wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  wrap.style.width = `${width}px`;
  wrap.style.height = `${height}px`;
  wrap.style.background = 'var(--color-primary)';
  wrap.style.color = 'var(--color-text-on-dark)';
  wrap.style.padding = '8px';
  wrap.appendChild(cloned);

  const serialized = new XMLSerializer().serializeToString(wrap);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject x="0" y="0" width="100%" height="100%">${serialized}</foreignObject>
    </svg>
  `;

  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = uiColor('--color-primary');
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0);

    return await new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Snapshot export failed'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function exportElementSnapshot(elementId, filenameBase) {
  const el = document.getElementById(elementId);
  if (!el) {
    showToast('Snapshot target unavailable', 'warning');
    return;
  }

  try {
    const blob = await createSnapshotBlobFromElement(el);
    const fileName = `${(filenameBase || 'snapshot').replace(/[^a-z0-9_-]+/gi, '_')}_${Date.now()}.png`;

    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'CricLeague Snapshot' });
      showToast('Snapshot shared', 'success');
      return;
    }

    downloadBlob(blob, fileName);
    showToast('Snapshot downloaded', 'success');
  } catch (err) {
    showToast('Snapshot export failed', 'danger');
  }
}

async function exportActiveScorecardSnapshot() {
  await exportElementSnapshot('scorecardContent', `scorecard_${activeScorecardTab.toLowerCase()}`);
}

function setScorecardTab(tab) {
  if (!['INNINGS1', 'INNINGS2'].includes(tab)) return;
  activeScorecardTab = tab;
  updateScorecardTabUI();
  renderScorecard();
}

function updateScorecardTabUI() {
  const map = [
    ['scorecardTabI1', 'INNINGS1'],
    ['scorecardTabI2', 'INNINGS2']
  ];

  map.forEach(([id, tab]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.style.background = activeScorecardTab === tab ? 'var(--primary-color)' : 'transparent';
    btn.style.color = activeScorecardTab === tab ? 'var(--color-text-on-dark)' : 'var(--color-text-muted)';
  });
}

function setOversInningsTab(tab) {
  if (!['INNINGS1', 'INNINGS2'].includes(tab)) return;
  activeOversInningsTab = tab;
  renderOvers();
}

function updateOversTabUI(hasSecondInnings) {
  const firstButton = document.getElementById('oversTabI1');
  const secondButton = document.getElementById('oversTabI2');
  if (secondButton) secondButton.style.display = hasSecondInnings ? '' : 'none';
  if (!hasSecondInnings) activeOversInningsTab = 'INNINGS1';
  [[firstButton, 'INNINGS1'], [secondButton, 'INNINGS2']].forEach(([button, tab]) => {
    if (!button) return;
    const active = activeOversInningsTab === tab;
    button.style.background = active ? 'var(--primary-color)' : 'transparent';
    button.style.color = active ? 'var(--color-text-on-dark)' : 'var(--text-muted)';
    button.setAttribute('aria-pressed', `${active}`);
  });
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
  renderScorecardInnings(activeScorecardTab);
}

function renderScorecardInnings(tab) {
  if (!activeMatch) return;
  const content = document.getElementById('scorecardContent');
  const baseMatch = activeMatch;
  const allHistory = baseMatch.ballHistory || [];
  const splitIdx = baseMatch.innings1Data?.recordedBallsCount || allHistory.length;
  let m = baseMatch;
  let inningsLabel = 'Quick Match';
  let isInningsView = false;

  if (tab === 'INNINGS1' || tab === 'INNINGS2') {
    isInningsView = true;
    const isI1 = tab === 'INNINGS1';
    const inningsBalls = isI1 ? allHistory.slice(0, splitIdx) : allHistory;
    const battingTeamId = isI1
      ? (baseMatch.initialBattingTeamId || baseMatch.teamA?.id)
      : (baseMatch.initialBowlingTeamId || baseMatch.teamB?.id);
    const bowlingTeamId = isI1
      ? (baseMatch.initialBowlingTeamId || baseMatch.teamB?.id)
      : (baseMatch.initialBattingTeamId || baseMatch.teamA?.id);

    const firstInningsPhysicalBalls = isI1
      ? inningsBalls.filter(ball => window.ScoringEngine.isPhysicalBall(ball)).length
      : 0;
    const shadowMatch = {
      ...baseMatch,
      status: 'LIVE',
      winnerId: null,
      target: null,
      currentInnings: 1,
      battingTeamId: isI1 ? battingTeamId : (baseMatch.initialBattingTeamId || battingTeamId),
      bowlingTeamId: isI1 ? bowlingTeamId : (baseMatch.initialBowlingTeamId || bowlingTeamId),
      oversPerInnings: isI1
        ? Math.max(baseMatch.oversPerInnings || 5, Math.ceil(firstInningsPhysicalBalls / 6) + 1)
        : baseMatch.oversPerInnings,
      gullyRules: isI1
        ? { ...(baseMatch.gullyRules || {}), lastManStanding: true }
        : baseMatch.gullyRules,
      strikerId: null,
      nonStrikerId: null,
      currentBowlerId: null,
      lastBowlerId: null,
      pendingAction: 'NONE',
      isSecondInningsStarted: !isI1,
      ballHistory: inningsBalls,
      wicketHistory: [],
      totalRuns: 0,
      totalWickets: 0,
      totalBalls: 0,
      wideCount: 0,
      noBallCount: 0,
      byeCount: 0,
      legByeCount: 0,
      innings1Data: null
    };

    m = window.ScoringEngine.recalculateMatchFromHistory(shadowMatch);
    if (!isI1) {
      // The second-innings replay needs first-innings balls to reproduce the
      // transition and target. Show only second-innings deliveries afterward.
      m.ballHistory = allHistory.slice(splitIdx);
    }
    inningsLabel = isI1 ? 'Innings 1' : 'Innings 2';
  }

  const isBattingA = m.battingTeamId === m.teamA?.id;
  const battingTeam = isBattingA ? m.teamA : m.teamB;
  const bowlingTeam = isBattingA ? m.teamB : m.teamA;

  let batHtml = (battingTeam?.players || []).filter(p => {
    const s = p.battingStats || {};
    return Number(s.balls || 0) > 0 || Number(s.runs || 0) > 0 || s.isOut || s.isRetiredHurt;
  }).map(p => {
    const s = p.battingStats || { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, wicketType: 'NONE' };
    const sr = s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(1) : '0.0';
    const status = formatDismissalText(s, bowlingTeam);

    const isC = isCaptainPlayer(p, battingTeam.id, m);
    const isVC = isViceCaptainPlayer(p, battingTeam.id, m);

    return `
      <tr>
        <td>
          <span class="scorecard-batter-name">${p.name}</span>
          ${isC ? '<span class="badge-c">(C)</span>' : ''}
          ${isVC ? '<span class="badge-vc">(VC)</span>' : ''}
          <br><span class="scorecard-dismissal-text">${status}</span>
        </td>
        <td style="text-align:right"><b>${s.runs}</b></td>
        <td style="text-align:right">${s.balls}</td>
        <td style="text-align:right">${s.fours}</td>
        <td style="text-align:right">${s.sixes}</td>
        <td style="text-align:right">${sr}</td>
      </tr>
    `;
  }).join('');

  let bowlHtml = (bowlingTeam?.players || []).filter(p => {
    const s = p.bowlingStats || {};
    return Number(s.overs || 0) > 0 || Number(s.balls || 0) > 0 || Number(s.maidens || 0) > 0
      || Number(s.runsConceded || 0) > 0 || Number(s.wickets || 0) > 0;
  }).map(p => {
    const s = p.bowlingStats || { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0 };
    const totalOversDec = s.overs + (s.balls / 6);
    const eco = totalOversDec > 0 ? (s.runsConceded / totalOversDec).toFixed(2) : '0.00';

    const isC = isCaptainPlayer(p, bowlingTeam.id, m);
    const isVC = isViceCaptainPlayer(p, bowlingTeam.id, m);

    return `
      <tr>
        <td style="font-weight:600; color:var(--color-text);">
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
  const statusColor = m.status === 'COMPLETED' ? 'var(--color-success)' : (m.status === 'ABANDONED' ? 'var(--color-warning)' : 'var(--color-info)');
  content.innerHTML = `
    <div style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">
      <b>View:</b> ${inningsLabel} | <b>Match Status:</b> <span style="color:${statusColor};">${baseMatch.status || 'LIVE'}</span> | <b>Score:</b> ${m.totalRuns}/${m.totalWickets} (${Math.floor((m.totalBalls||0)/6)}.${(m.totalBalls||0)%6} Ov)
    </div>

    <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; margin-top:12px;">Batting (${battingTeam?.name})</h4>
    <div class="responsive-table-scroll"><table class="stats-table scorecard-responsive-table">
      <thead>
        <tr><th>Batter</th><th style="text-align:right">R</th><th style="text-align:right">B</th><th style="text-align:right">4s</th><th style="text-align:right">6s</th><th style="text-align:right">SR</th></tr>
      </thead>
      <tbody>${batHtml}</tbody>
    </table></div>

    <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; margin-top:16px;">Bowling (${bowlingTeam?.name})</h4>
    <div class="responsive-table-scroll"><table class="stats-table scorecard-responsive-table">
      <thead>
        <tr><th>Bowler</th><th style="text-align:right">O</th><th style="text-align:right">M</th><th style="text-align:right">R</th><th style="text-align:right">W</th><th style="text-align:right">ECO</th></tr>
      </thead>
      <tbody>${bowlHtml}</tbody>
    </table></div>

    <h4 style="font-size:12px; color:var(--text-muted); text-transform:uppercase; margin-top:16px;">Fall of Wickets</h4>
    <ul style="padding-left:18px; margin-top:6px; font-size:12px; line-height:1.6; color:var(--text-muted);">
      ${history.map(w => `<li><b>${w.wicketNumber}-${w.totalRuns}</b> (${w.batterName}, ${w.over} ov - ${w.wicketType})</li>`).join('') || '<li>No wickets yet</li>'}
    </ul>
  `;
}

function renderOvers() {
  if (!activeMatch) return;
  const container = document.getElementById('oversContainer');
  const allHistory = activeMatch.ballHistory || [];
  const splitIdx = activeMatch.innings1Data?.recordedBallsCount ?? allHistory.length;
  const innings1TeamId = activeMatch.initialBattingTeamId || activeMatch.teamA?.id;
  const innings2TeamId = activeMatch.initialBowlingTeamId || (innings1TeamId === activeMatch.teamA?.id ? activeMatch.teamB?.id : activeMatch.teamA?.id);
  const innings = [
    {
      label: '1st Innings',
      battingTeam: [activeMatch.teamA, activeMatch.teamB].find(team => team?.id === innings1TeamId),
      bowlingTeam: [activeMatch.teamA, activeMatch.teamB].find(team => team?.id !== innings1TeamId),
      balls: allHistory.slice(0, splitIdx),
      indexOffset: 0
    }
  ];
  const hasSecondInnings = activeMatch.currentInnings === 2
    || activeMatch.isSecondInningsStarted === true
    || allHistory.length > splitIdx;
  if (hasSecondInnings) {
    innings.push({
      label: '2nd Innings',
      battingTeam: [activeMatch.teamA, activeMatch.teamB].find(team => team?.id === innings2TeamId),
      bowlingTeam: [activeMatch.teamA, activeMatch.teamB].find(team => team?.id !== innings2TeamId),
      balls: allHistory.slice(splitIdx),
      indexOffset: splitIdx
    });
  }

  // Switch to the new innings once at transition, while preserving manual tab selection afterward.
  const currentInningsKey = `${activeMatch.currentInnings || 1}`;
  if (container?.dataset.currentInnings !== currentInningsKey) {
    activeOversInningsTab = currentInningsKey === '2' ? 'INNINGS2' : 'INNINGS1';
    if (container) container.dataset.currentInnings = currentInningsKey;
  }

  const inningsHtml = innings.map(inningsView => {
    const inningsMatch = { ...activeMatch, ballHistory: inningsView.balls };
    const summaries = window.ScoringEngine.getOverSummaries(inningsMatch);
    const indexedOvers = getOverGroupsWithIndices(inningsMatch, inningsView.indexOffset).slice().reverse();
    if (summaries.length === 0) {
      return `<section style="margin-bottom:18px;"><h4 style="font-size:14px; margin-bottom:8px;">${inningsView.label} — ${inningsView.battingTeam?.name || 'Team'}</h4><div style="font-size:12px; color:var(--text-muted);">No balls recorded in this innings yet.</div></section>`;
    }

    const rows = summaries.slice().reverse().map((over, idx) => {
      const indexedOver = indexedOvers[idx] || { balls: [] };
      const bowlerBall = indexedOver.balls.find(({ ball }) => !ball.isAdjustment && ball.bowlerId)?.ball;
      const bowlerId = bowlerBall?.bowlerId;
      const bowler = (inningsView.bowlingTeam?.players || []).find(player => player.id === bowlerId)
        || (inningsView.bowlingTeam?.players || []).find(player => player.name?.toLowerCase() === `${bowlerId || ''}`.toLowerCase());
      const bowlerLabel = bowler?.name || bowlerBall?.bowlerName || (bowlerId ? `${bowlerId}` : 'Not recorded');

      const chipsHtml = (over.balls || []).map((ball, ballIdx) => {
        const histIndex = indexedOver.balls[ballIdx]?.index;
        let label = ball.runs;
        let cls = 'ball-chip';
        if (ball.isAdjustment && ball.adjustmentSlot === 'SWAP') { label = '🔀'; cls += ' extra'; }
        else if (ball.wicketType && ball.wicketType !== 'NONE') { label = ball.wicketType === 'RETIRED_HURT' ? 'RET' : 'W'; cls += ' wicket'; }
        else if (ball.isDroppedCatch || ball.wasDroppedCatch) { label = `🤲${ball.runs || 0}`; cls += ' extra'; }
        else if (ball.runs === 4) cls += ' four';
        else if (ball.runs === 6) cls += ' six';
        else if (ball.runs === 1 && ball.rotateStrike === false) { label = '1G'; }
        else if (ball.extrasType === 'GRANTED') { label = '1G'; cls += ' extra'; }
        else if (ball.extrasType === 'WIDE') { label = `${ball.extraRuns ?? 1}WD`; cls += ' extra'; }
        else if (ball.extrasType === 'NO_BALL') {
          const total = (ball.runs || 0) + (ball.extraRuns || 1);
          label = total > 1 ? `${total}NB` : 'NB';
          cls += ' extra';
        }
        else if (ball.extrasType === 'BYE') { label = `${ball.extraRuns ?? 0}B`; cls += ' extra'; }
        else if (ball.extrasType === 'LEG_BYE') { label = `${ball.extraRuns ?? 0}LB`; cls += ' extra'; }
        const editAttr = (!isReadOnlySpectator && Number.isInteger(histIndex))
          ? ` onclick="openEditBallModal(${histIndex})" title="Edit ball" style="cursor:pointer;"`
          : '';
        return `<div class="${cls}"${editAttr}>${label}</div>`;
      }).join('');

      return `
        <div class="over-card-row">
          <div style="flex:1; min-width:0;">
            <div style="font-size:13px; font-weight:700; color:var(--color-text);">Over ${over.overNumber} ${over.isPartial ? '(In Progress)' : ''}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">Bowler: <span style="color:var(--color-text); font-weight:600;">${bowlerLabel}</span></div>
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">${chipsHtml}</div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-size:15px; font-weight:800; color:var(--accent-color);">Over: ${over.runs} runs${over.wickets ? ` / ${over.wickets} wkts` : ''}</div>
            <div style="font-size:11px; color:var(--text-muted);">${inningsView.label}: ${inningsView.battingTeam?.name || 'Team'} ${over.teamTotalRuns}/${over.teamTotalWickets}</div>
          </div>
        </div>
      `;
    }).join('');

    return `<section style="margin-bottom:20px;"><h4 style="font-size:14px; margin-bottom:8px;">${inningsView.label} — ${inningsView.battingTeam?.name || 'Team'} batting</h4>${rows}</section>`;
  });

  container.innerHTML = '';
  updateOversTabUI(hasSecondInnings);
  const selectedIndex = activeOversInningsTab === 'INNINGS2' ? 1 : 0;
  if (!innings[selectedIndex] || innings[selectedIndex].balls.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No overs completed yet.</div>';
    return;
  }
  container.innerHTML = inningsHtml[selectedIndex];
}
