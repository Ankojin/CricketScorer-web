// stats UI module.
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

  const totalOvers = Math.max(1, Number(m.oversPerInnings || 20));

  const i1Stats = window.ScoringEngine.calculateInningsStats(i1Balls, {
    powerplayOvers: m.powerplayOvers,
    oversPerInnings: totalOvers
  });
  const i2Stats = window.ScoringEngine.calculateInningsStats(i2Balls, {
    powerplayOvers: m.powerplayOvers,
    oversPerInnings: totalOvers
  });

  const powerplayOvers = i1Stats.powerplayOvers || 0;
  const deathStartOver = i1Stats.deathStartOver || (powerplayOvers + 1);

  const i1Partnerships = window.ScoringEngine.calculatePartnerships(i1Balls, m);
  const i2Partnerships = window.ScoringEngine.calculatePartnerships(i2Balls, m);

  const motm = window.ScoringEngine.calculateMotm(m);
  const fc = window.ScoringEngine.calculateForecaster(m);

  const i1Name = m.initialBattingTeamId === teamA.id ? teamA.name : teamB.name;
  const i2Name = m.initialBattingTeamId === teamA.id ? teamB.name : teamA.name;

  const motmCardHtml = motm ? `
    <div class="card" style="background:var(--color-primary); border-color:var(--color-electric); padding:16px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="font-size:36px;">🌟</div>
        <div>
          <div style="font-size:11px; color:var(--color-electric); font-weight:800; text-transform:uppercase;">MAN OF THE MATCH • ICC RANKED</div>
          <div style="font-size:18px; font-weight:900; color:var(--color-text-on-dark);">${motm.player.name.toUpperCase()}</div>
          <div style="font-size:12px; color:var(--color-text-on-dark);">Impact Score: <span style="color:var(--color-electric); font-weight:800;">${motm.impactScore} pts</span></div>
        </div>
      </div>
    </div>
  ` : '';

  const forecasterCardHtml = `
    <div class="card" style="padding:16px;">
      <h4 style="font-size:13px; color:var(--primary-color); font-weight:900; text-transform:uppercase; margin-bottom:10px;">🔮 MATCH FORECASTER</h4>

      <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:800; margin-bottom:4px;">
        <span style="color:${teamA.colorHex||'#13a968'}">${teamA.name.toUpperCase()} (${fc.teamAWin}%)</span>
        <span style="color:${teamB.colorHex||'#38bdf8'}">${teamB.name.toUpperCase()} (${fc.teamBWin}%)</span>
      </div>

      <div style="height:10px; background:var(--color-surface-soft); border-radius:6px; overflow:hidden; display:flex;">
        <div style="width:${fc.teamAWin}%; background:${teamA.colorHex||'#13a968'}; transition:width 0.5s ease;"></div>
        <div style="width:${fc.teamBWin}%; background:${teamB.colorHex||'#38bdf8'}; transition:width 0.5s ease;"></div>
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

      ${buildBreakdownRow(`Powerplay (1-${powerplayOvers} Ov)`, `${i1Stats.ppRuns}/${i1Stats.ppWickets}`, `${i2Stats.ppRuns}/${i2Stats.ppWickets}`)}
      ${i1Stats.hasMid || i2Stats.hasMid ? buildBreakdownRow(`Middle Overs (${powerplayOvers + 1}-${deathStartOver - 1} Ov)`, `${i1Stats.midRuns}/${i1Stats.midWickets}`, `${i2Stats.midRuns}/${i2Stats.midWickets}`) : ''}
      ${i1Stats.hasFin || i2Stats.hasFin ? buildBreakdownRow(`Final Overs (${deathStartOver}-${totalOvers} Ov)`, `${i1Stats.finRuns}/${i1Stats.finWickets}`, `${i2Stats.finRuns}/${i2Stats.finWickets}`) : ''}

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
      <canvas id="progressChartCanvas" width="480" height="220" style="width:100%; height:220px; background:var(--color-primary); border-radius:8px;"></canvas>
    </div>

    <!-- 4. Over-by-Over Bar Chart Card -->
    <div class="card" style="padding:16px;">
      <h4 style="font-size:13px; color:var(--primary-color); font-weight:900; text-transform:uppercase; margin-bottom:12px;">📊 OVER BY OVER</h4>
      <canvas id="overByOverChartCanvas" width="480" height="220" style="width:100%; height:220px; background:var(--color-primary); border-radius:8px;"></canvas>
    </div>
  `;

  // Draw Interactive Canvas Charts
  setTimeout(() => {
    drawProgressCanvasChart(m, i1Balls, i2Balls, teamA.colorHex || '#13a968', teamB.colorHex || '#38bdf8');
    drawOverByOverCanvasChart(m, i1Balls, i2Balls, teamA.colorHex || '#13a968', teamB.colorHex || '#38bdf8');
  }, 50);
}

function buildBreakdownRow(label, v1, v2) {
  return `
    <div style="display:flex; justify-content:space-between; font-size:13px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.03);">
      <span style="font-weight:700; color:var(--color-text-on-dark); width:30%;">${v1}</span>
      <span style="color:var(--text-muted); text-align:center; width:40%; font-size:11px;">${label}</span>
      <span style="font-weight:700; color:var(--color-text-on-dark); text-align:right; width:30%;">${v2}</span>
    </div>
  `;
}

function buildPartnershipsHtml(title, partnerships) {
  if (!partnerships || partnerships.length === 0) return `<div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">No partnerships recorded for ${title}.</div>`;

  const rows = partnerships.map(p => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--color-primary); padding:8px; border-radius:8px; margin-bottom:6px; font-size:12px;">
      <div style="width:35%;">
        <div style="font-weight:700; color:var(--color-text-on-dark);">${p.batter1Name}</div>
        <div style="color:var(--text-muted); font-size:10px;">${p.batter1Runs} (${p.batter1Balls}b)</div>
      </div>
      <div style="text-align:center; background:var(--color-primary-soft); padding:4px 10px; border-radius:6px;">
        <div style="font-size:14px; font-weight:900; color:var(--accent-color);">${p.totalRuns}</div>
        <div style="font-size:10px; color:var(--text-muted);">${p.totalBalls}b stand</div>
      </div>
      <div style="text-align:right; width:35%;">
        <div style="font-weight:700; color:var(--color-text-on-dark);">${p.batter2Name}</div>
        <div style="color:var(--text-muted); font-size:10px;">${p.batter2Runs} (${p.batter2Balls}b)</div>
      </div>
    </div>
  `).join('');

  return `
    <div style="font-size:11px; font-weight:800; color:var(--accent-color); text-transform:uppercase; margin-top:8px; margin-bottom:6px;">${title}</div>
    ${rows}
  `;
}

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

  ctx.strokeStyle = uiColor('--color-border-dark');
  ctx.lineWidth = 0.5;
  ctx.fillStyle = uiColor('--color-text-subtle');
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
        ctx.fillStyle = uiColor('--color-text-on-dark');
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  drawLine(p1, color1);
  if (match.currentInnings === 2 || i2Balls.length > 0) drawLine(p2, color2);
}

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

  ctx.strokeStyle = uiColor('--color-border-dark');
  ctx.lineWidth = 0.5;
  ctx.fillStyle = uiColor('--color-text-subtle');
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
        ctx.fillStyle = uiColor('--color-text-on-dark');
        ctx.beginPath(); ctx.arc(xBase + barW / 2, padT + h - bH - 6, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    const over2 = o2.find(x => x.over === idx + 1);
    if (over2 && over2.runs > 0) {
      const bH = (over2.runs / maxRuns) * h;
      ctx.fillStyle = color2;
      ctx.fillRect(xBase + barW + 2, padT + h - bH, barW, bH);

      if (over2.wickets > 0) {
        ctx.fillStyle = uiColor('--color-text-on-dark');
        ctx.beginPath(); ctx.arc(xBase + barW + 2 + barW / 2, padT + h - bH - 6, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}
