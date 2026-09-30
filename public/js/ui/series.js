// series UI module.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureSeriesAccess() {
  return requireRegisteredScoringMode('Series', { keepCurrentScreen: true });
}

async function openSeriesCreateFlow() {
  if (!ensureSeriesAccess()) return;
  await showTournamentsScreen();
  openNewTournamentModal();
}

async function exportTournamentSnapshot(tournamentId) {
  if (!tournamentId) return;
  await exportElementSnapshot(`tourneyCard_${tournamentId}`, `series_${tournamentId}`);
}

function buildSeriesFixtureStatus(fixture, linkedMatch) {
  if (linkedMatch?.status === 'COMPLETED') return 'COMPLETED';
  if (linkedMatch?.status === 'ABANDONED') return 'ABANDONED';
  if (linkedMatch?.status === 'LIVE') return 'LIVE';
  return fixture?.status || 'SCHEDULED';
}

async function renderTournaments() {
  if (!ensureSeriesAccess()) return;
  const container = document.getElementById('tournamentsContainer');
  const tourneys = await window.CricStorage.listTournaments();
  const matches = await window.CricStorage.listMatches();
  const canBuildPointsTable = !!window.ScoringEngine && typeof window.ScoringEngine.calculatePointsTable === 'function';

  if (activeTourneySubTab === 'MATCHES') {
    activeTourneySubTab = 'SCHEDULE';
  }

  container.innerHTML = '';

  if (!tourneys || tourneys.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No tournament series created yet. Click "+ New Series" above!</div>';
    return;
  }

  tourneys.forEach(t => {
    const card = document.createElement('div');
    card.id = `tourneyCard_${t.id}`;
    card.className = 'card';
    const d = getTournamentDefaults(t);
    const defaultsSummary = `
      <div style="font-size:11px; color:var(--text-muted); margin-bottom:10px;">
        Defaults: ${d.oversPerInnings || 5} ov | Max Bowler ${d.maxOversPerBowler || 2} ov${d.powerplayOvers ? ` | PP ${d.powerplayOvers} ov` : ''}${d.quotaBowlersCount ? ` | Quota Bowlers ${d.quotaBowlersCount}` : ''}${d.quotaMaxOvers ? ` | Quota Max ${d.quotaMaxOvers} ov` : ''}
      </div>
    `;

    const pointsTable = canBuildPointsTable
      ? window.ScoringEngine.calculatePointsTable(t.teams || [], matches)
      : [];
    const tableRows = pointsTable.map(p => `
      <tr>
        <td style="font-weight:700;"><span class="team-badge" style="background:${p.colorHex}"></span>${escapeHtml(p.name)}</td>
        <td style="text-align:right">${p.played}</td>
        <td style="text-align:right">${p.won}</td>
        <td style="text-align:right">${p.lost}</td>
        <td style="text-align:right">${p.tied || 0}</td>
        <td style="text-align:right">${p.nrr || '+0.000'}</td>
        <td style="text-align:right"><b>${p.points}</b></td>
      </tr>
    `).join('');

    const teamsListHtml = (t.teams || []).map(tm => `
      <div style="background:var(--color-surface-soft); border:1px solid var(--color-border); border-radius:8px; margin-top:6px; padding:8px 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:700; font-size:13px; color:var(--color-text);">
            <span class="team-badge" style="background:${tm.colorHex||'#38bdf8'}"></span>${escapeHtml(tm.name)} (${(tm.players||[]).length} Players)
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn" style="padding:3px 8px; font-size:11px;" onclick="toggleSeriesTeamRoster('${t.id}','${tm.id}')">📋 Squad</button>
            <button class="btn" style="background:var(--color-danger-soft); color:var(--color-error); border-color:var(--color-error); padding:3px 8px; font-size:11px;" onclick="removeSeriesTeam('${t.id}','${tm.id}')">❌ Detach</button>
          </div>
        </div>
        <div id="seriesTeamRoster_${t.id}_${tm.id}" hidden style="margin-top:8px; padding-top:6px; border-top:1px solid var(--color-border);">
          ${(tm.players||[]).map((p, i) => `<div style="font-size:11px; padding:2px 0; color:var(--color-text); display:flex; justify-content:space-between;"><span>${i+1}. ${escapeHtml(p.name)}</span><span style="color:var(--text-muted); font-size:10px;">${escapeHtml(p.role||'Batter')}</span></div>`).join('') || '<div style="font-size:11px; color:var(--text-muted);">No players in squad</div>'}
        </div>
      </div>
    `).join('');

    const teamsForSchedule = Array.isArray(t.teams) ? t.teams : [];
    const fixtures = Array.isArray(t.fixtures) ? t.fixtures : [];
    const renderedFixtures = fixtures.map((fixture, idx) => {
          const teamA = teamsForSchedule.find(team => team.id === fixture.teamAId);
          const teamB = teamsForSchedule.find(team => team.id === fixture.teamBId);
          const linkedMatch = fixture.linkedMatchId
            ? matches.find(match => match.id === fixture.linkedMatchId)
            : null;
          const status = buildSeriesFixtureStatus(fixture, linkedMatch);
          const badgeColor = status === 'COMPLETED'
            ? 'var(--color-success)'
            : status === 'LIVE'
              ? 'var(--color-info)'
              : status === 'ABANDONED'
                ? 'var(--color-warning)'
                : 'var(--text-muted)';
          const whenText = fixture.scheduledAt
            ? new Date(fixture.scheduledAt).toLocaleString()
            : 'Unscheduled time';
          return {
            fixture,
            status,
            html: `
            <div style="background:var(--color-surface-soft); border:1px solid var(--color-border); border-radius:10px; padding:10px; margin-top:8px;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div style="font-size:13px; font-weight:800; color:var(--color-text);">${escapeHtml(teamA?.name || 'Team A')} vs ${escapeHtml(teamB?.name || 'Team B')}</div>
                <span style="font-size:10px; font-weight:800; color:${badgeColor};">${status}</span>
              </div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${whenText}</div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${fixture.oversPerInnings || d.oversPerInnings || 5} ov • Max Bowler ${fixture.maxOversPerBowler || d.maxOversPerBowler || 2} ov${fixture.quotaBowlersCount ? ` • Bowlers ${fixture.quotaBowlersCount}` : ''}${fixture.quotaMaxOvers ? ` • Limit ${fixture.quotaMaxOvers}` : ''}</div>
              <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                <button class="btn" style="width:auto; padding:5px 9px; font-size:11px; background:var(--color-primary-soft); color:var(--color-text-on-dark); border-color:var(--color-primary);" onclick="startSeriesFixtureMatch('${t.id}','${fixture.id}')" ${status === 'COMPLETED' ? 'disabled' : ''}>▶ Start Match</button>
                ${fixture.linkedMatchId ? `<button class="btn" style="width:auto; padding:5px 9px; font-size:11px;" onclick="selectMatch('${fixture.linkedMatchId}')">Open Match</button>` : ''}
                <button class="btn" style="width:auto; padding:5px 9px; font-size:11px; background:var(--color-danger-soft); color:var(--color-error); border-color:var(--color-error);" onclick="deleteSeriesFixture('${t.id}','${fixture.id}')">Delete</button>
              </div>
            </div>
          `
          };
        });

    const activeFixtureRowsHtml = renderedFixtures
      .filter(item => item.status !== 'COMPLETED' && item.status !== 'ABANDONED')
      .map(item => item.html)
      .join('');

    const completedFixtureRowsHtml = renderedFixtures
      .filter(item => item.status === 'COMPLETED' || item.status === 'ABANDONED')
      .map(item => item.html)
      .join('');

    const scheduleTeamOptions = teamsForSchedule.map(team =>
      `<option value="${team.id}">${escapeHtml(team.name)}</option>`
    ).join('');

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h4 style="font-size:16px; font-weight:800; color:var(--color-primary);">🏆 ${escapeHtml(t.name)}</h4>
        <div style="display:flex; gap:6px;">
          <button class="btn" style="background:var(--color-primary); color:var(--color-text-on-dark); border-color:var(--color-primary); padding:4px 8px; font-size:11px;" onclick="exportTournamentSnapshot('${t.id}')">📸 Snapshot</button>
          <button class="btn" style="background:var(--color-surface-soft); color:var(--color-text); padding:4px 8px; font-size:11px;" onclick="openEditTournamentModal('${t.id}')">✏️ Edit Defaults</button>
          <button class="btn" style="background:var(--color-danger-soft); color:var(--color-error); border-color:var(--color-error); padding:4px 8px; font-size:11px;" onclick="deleteSeries('${t.id}')">🗑️ Delete</button>
        </div>
      </div>

      ${defaultsSummary}

      <!-- Sub-Tabs Bar for Tournament Details -->
      <div style="display:flex; gap:6px; background:var(--color-surface-soft); padding:4px; border-radius:8px; margin-top:8px; margin-bottom:12px;">
        <button class="btn" style="flex:1; padding:6px; font-size:11px; background:${activeTourneySubTab==='TEAMS'?'var(--primary-color)':'transparent'}" onclick="setTourneySubTab('TEAMS')">TEAMS</button>
        <button class="btn" style="flex:1; padding:6px; font-size:11px; background:${activeTourneySubTab==='SCHEDULE'?'var(--primary-color)':'transparent'}" onclick="setTourneySubTab('SCHEDULE')">SCHEDULE</button>
        <button class="btn" style="flex:1; padding:6px; font-size:11px; background:${activeTourneySubTab==='TABLE'?'var(--primary-color)':'transparent'}" onclick="setTourneySubTab('TABLE')">TABLE</button>
      </div>

      ${activeTourneySubTab === 'TEAMS' ? `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Series Teams</div>
          <button class="btn-primary" style="width:auto; padding:4px 8px; font-size:11px;" onclick="openNewTeamModal('${t.id}')">+ Add Team</button>
        </div>
        <div style="margin-top:6px;">${teamsListHtml || '<div style="font-size:12px; color:var(--text-muted);">No teams in this series yet.</div>'}</div>
      ` : ''}

      ${activeTourneySubTab === 'SCHEDULE' ? `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <div style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Series Match Schedule</div>
          <div style="display:flex; gap:6px;">
            ${teamsForSchedule.length >= 2 ? `<button class="btn" style="background:var(--color-primary-soft); color:var(--color-text-on-dark); border-color:var(--color-primary); padding:4px 8px; font-size:11px;" onclick="autoGenerateRoundRobinFixtures('${t.id}')">⚡ Auto Fixtures</button>` : ''}
            <button class="btn-primary" style="width:auto; padding:4px 8px; font-size:11px;" onclick="startSeriesMatch('${t.id}')">+ Quick Start (No Fixture)</button>
          </div>
        </div>
        ${teamsForSchedule.length < 2 ? '<div style="font-size:12px; color:var(--color-warning); margin-top:8px;">Add at least 2 teams before scheduling fixtures.</div>' : `
          <div style="margin-top:8px; padding:10px; background:var(--color-surface-soft); border:1px solid var(--color-border); border-radius:10px;">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <div style="flex:1; min-width:140px;"><label style="font-size:11px; color:var(--text-muted);">Team A</label><select id="fixtureTeamA_${t.id}" class="form-control">${scheduleTeamOptions}</select></div>
              <div style="flex:1; min-width:140px;"><label style="font-size:11px; color:var(--text-muted);">Team B</label><select id="fixtureTeamB_${t.id}" class="form-control">${scheduleTeamOptions}</select></div>
            </div>
            <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
              <div style="flex:1; min-width:120px;"><label style="font-size:11px; color:var(--text-muted);">Date & Time</label><input id="fixtureWhen_${t.id}" type="datetime-local" class="form-control"></div>
              <div style="width:110px;"><label style="font-size:11px; color:var(--text-muted);">Overs</label><input id="fixtureOvers_${t.id}" type="number" min="1" class="form-control" value="${d.oversPerInnings || 5}"></div>
              <div style="width:140px;"><label style="font-size:11px; color:var(--text-muted);">Max Bowler</label><input id="fixtureMaxBowler_${t.id}" type="number" min="1" class="form-control" value="${d.maxOversPerBowler || 2}"></div>
            </div>
            <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
              <div style="width:130px;"><label style="font-size:11px; color:var(--text-muted);">Powerplay</label><input id="fixturePowerplay_${t.id}" type="number" min="0" class="form-control" value="${d.powerplayOvers || ''}" placeholder="None"></div>
              <div style="width:160px;"><label style="font-size:11px; color:var(--text-muted);">No. of Bowlers</label><input id="fixtureQuotaCount_${t.id}" type="number" min="0" class="form-control" value="${d.quotaBowlersCount || ''}" placeholder="No limit"></div>
              <div style="width:160px;"><label style="font-size:11px; color:var(--text-muted);">Per Bowler Limit</label><input id="fixtureQuotaMax_${t.id}" type="number" min="0" class="form-control" value="${d.quotaMaxOvers || ''}" placeholder="No limit"></div>
              <div style="display:flex; align-items:flex-end;"><button class="btn-primary" style="width:auto; padding:8px 12px; font-size:12px;" onclick="createSeriesFixture('${t.id}')">Create Fixture</button></div>
            </div>
          </div>
        `}
        <div style="margin-top:10px;">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Active Fixtures</div>
          ${activeFixtureRowsHtml || '<div style="font-size:12px; color:var(--text-muted); margin-top:8px;">No active fixtures.</div>'}
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700; margin-top:12px;">Completed Fixtures</div>
          ${completedFixtureRowsHtml || '<div style="font-size:12px; color:var(--text-muted); margin-top:8px;">No completed fixtures yet.</div>'}
        </div>
      ` : ''}

      ${activeTourneySubTab === 'TABLE' ? `
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Points Table</div>
        ${!canBuildPointsTable ? '<div style="font-size:11px; color:var(--color-warning); margin:6px 0;">Standings temporarily unavailable, but your series is saved.</div>' : ''}
        <table class="stats-table">
          <thead>
            <tr><th>Team</th><th style="text-align:right">P</th><th style="text-align:right">W</th><th style="text-align:right">L</th><th style="text-align:right">T</th><th style="text-align:right">NRR</th><th style="text-align:right">PTS</th></tr>
          </thead>
          <tbody>${tableRows || '<tr><td colspan="7" style="text-align:center;">No completed matches</td></tr>'}</tbody>
        </table>
      ` : ''}
    `;
    container.appendChild(card);
  });
}

async function createSeriesFixture(tournamentId) {
  if (!ensureSeriesAccess()) return;
  const tourneys = await window.CricStorage.listTournaments();
  const target = (tourneys || []).find(t => t.id === tournamentId);
  if (!target) {
    showToast('Series not found', 'warning');
    return;
  }

  const teamAId = document.getElementById(`fixtureTeamA_${tournamentId}`)?.value;
  const teamBId = document.getElementById(`fixtureTeamB_${tournamentId}`)?.value;
  if (!teamAId || !teamBId) {
    showToast('Select both teams', 'warning');
    return;
  }
  if (teamAId === teamBId) {
    showToast('Team A and Team B must be different', 'warning');
    return;
  }

  const overs = Math.max(1, parseInt(document.getElementById(`fixtureOvers_${tournamentId}`)?.value, 10) || 5);
  const maxBowler = Math.max(1, parseInt(document.getElementById(`fixtureMaxBowler_${tournamentId}`)?.value, 10) || 2);
  const powerplayRaw = parseInt(document.getElementById(`fixturePowerplay_${tournamentId}`)?.value, 10);
  const quotaCountRaw = parseInt(document.getElementById(`fixtureQuotaCount_${tournamentId}`)?.value, 10);
  const quotaMaxRaw = parseInt(document.getElementById(`fixtureQuotaMax_${tournamentId}`)?.value, 10);
  const whenValue = document.getElementById(`fixtureWhen_${tournamentId}`)?.value;

  const fixture = {
    id: `fix_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    teamAId,
    teamBId,
    scheduledAt: whenValue ? new Date(whenValue).toISOString() : null,
    oversPerInnings: overs,
    maxOversPerBowler: maxBowler,
    powerplayOvers: Number.isNaN(powerplayRaw) || powerplayRaw <= 0 ? null : Math.min(powerplayRaw, overs),
    quotaBowlersCount: Number.isNaN(quotaCountRaw) || quotaCountRaw <= 0 ? null : quotaCountRaw,
    quotaMaxOvers: Number.isNaN(quotaMaxRaw) || quotaMaxRaw <= 0 ? null : quotaMaxRaw,
    status: 'SCHEDULED',
    linkedMatchId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  target.fixtures = [...(target.fixtures || []), fixture];
  await window.CricStorage.saveTournament(target);
  showToast('Fixture scheduled', 'success');
  renderTournaments();
}

async function deleteSeriesFixture(tournamentId, fixtureId) {
  if (!ensureSeriesAccess()) return;
  const tourneys = await window.CricStorage.listTournaments();
  const target = (tourneys || []).find(t => t.id === tournamentId);
  if (!target) return;

  target.fixtures = (target.fixtures || []).filter(fixture => fixture.id !== fixtureId);
  await window.CricStorage.saveTournament(target);
  showToast('Fixture removed', 'info');
  renderTournaments();
}

async function startSeriesFixtureMatch(tournamentId, fixtureId) {
  if (!ensureSeriesAccess()) return;
  const tourneys = await window.CricStorage.listTournaments();
  const target = (tourneys || []).find(t => t.id === tournamentId);
  if (!target) {
    showToast('Series not found', 'warning');
    return;
  }

  const fixture = (target.fixtures || []).find(item => item.id === fixtureId);
  if (!fixture) {
    showToast('Fixture not found', 'warning');
    return;
  }

  const teamA = (target.teams || []).find(team => team.id === fixture.teamAId);
  const teamB = (target.teams || []).find(team => team.id === fixture.teamBId);
  if (!teamA || !teamB) {
    showToast('Fixture teams are missing from this series', 'warning');
    return;
  }

  activeTournament = target;
  await showNewMatchScreen('FULL', {
    source: 'SERIES',
    tournamentId,
    prefill: {
      fixtureId: fixture.id,
      teamAId: fixture.teamAId,
      teamBId: fixture.teamBId,
      oversPerInnings: fixture.oversPerInnings,
      maxOversPerBowler: fixture.maxOversPerBowler,
      powerplayOvers: fixture.powerplayOvers,
      quotaBowlersCount: fixture.quotaBowlersCount,
      quotaMaxOvers: fixture.quotaMaxOvers
    }
  });
  showToast('Fixture loaded into match setup', 'info');
}

async function startSeriesMatch(tournamentId) {
  if (!ensureSeriesAccess()) return;
  if (!tournamentId) {
    showToast('Series not found', 'warning');
    return;
  }

  const tourneys = await window.CricStorage.listTournaments();
  const target = (tourneys || []).find(t => t.id === tournamentId);
  if (!target) {
    showToast('Series not found', 'warning');
    return;
  }

  activeTournament = target;
  await showNewMatchScreen('FULL', { source: 'SERIES', tournamentId });
}

function setTourneySubTab(tab) {
  activeTourneySubTab = tab;
  renderTournaments();
}

function populateTournamentDefaultsForm(tournament) {
  const d = getTournamentDefaults(tournament);
  const defaultOvers = document.getElementById('tourneyDefaultOvers');
  const defaultMaxBowler = document.getElementById('tourneyDefaultMaxBowlerOvers');
  const defaultPowerplay = document.getElementById('tourneyDefaultPowerplayOvers');
  const defaultQuotaBowlers = document.getElementById('tourneyDefaultQuotaBowlersCount');
  const defaultQuotaMax = document.getElementById('tourneyDefaultQuotaMaxOvers');
  const ruleCommonPlayer = document.getElementById('tourneyRuleCommonPlayer');
  const ruleJoinMidMatch = document.getElementById('tourneyRuleJoinMidMatch');
  const ruleSwitchMidMatch = document.getElementById('tourneyRuleSwitchMidMatch');
  const ruleNoExtras = document.getElementById('tourneyRuleNoExtras');
  const ruleLms = document.getElementById('tourneyRuleLMS');
  const ruleSingleSide = document.getElementById('tourneyRuleSingleSide');
  const ruleUnequal = document.getElementById('tourneyRuleUnequal');

  if (defaultOvers) defaultOvers.value = `${d.oversPerInnings || 5}`;
  if (defaultMaxBowler) defaultMaxBowler.value = `${d.maxOversPerBowler || 2}`;
  if (defaultPowerplay) defaultPowerplay.value = d.powerplayOvers ? `${d.powerplayOvers}` : '';
  if (defaultQuotaBowlers) defaultQuotaBowlers.value = d.quotaBowlersCount ? `${d.quotaBowlersCount}` : '';
  if (defaultQuotaMax) defaultQuotaMax.value = d.quotaMaxOvers ? `${d.quotaMaxOvers}` : '';
  if (ruleCommonPlayer) ruleCommonPlayer.checked = !!d.gullyRules.commonPlayer;
  if (ruleJoinMidMatch) ruleJoinMidMatch.checked = !!d.gullyRules.playersJoinMidMatch;
  if (ruleSwitchMidMatch) ruleSwitchMidMatch.checked = !!d.gullyRules.playersSwitchMidMatch;
  if (ruleNoExtras) ruleNoExtras.checked = !!d.gullyRules.noExtraRunsForWidesNoBalls;
  if (ruleLms) ruleLms.checked = !!d.gullyRules.lastManStanding;
  if (ruleSingleSide) ruleSingleSide.checked = !!d.gullyRules.singleSideBatting;
  if (ruleUnequal) ruleUnequal.checked = !!d.gullyRules.unequalTeams;
}

function openNewTournamentModal() {
  if (!ensureSeriesAccess()) return;
  tournamentModalMode = 'CREATE';
  editingTournamentId = null;

  const title = document.getElementById('tournamentModalTitle');
  const submit = document.getElementById('tournamentModalSubmitBtn');
  if (title) title.textContent = 'Create Tournament Series';
  if (submit) submit.textContent = 'Create Series';

  const nameInput = document.getElementById('tourneyName');
  if (nameInput) nameInput.value = 'Premier League 2025';

  const defaultOvers = document.getElementById('tourneyDefaultOvers');
  const defaultMaxBowler = document.getElementById('tourneyDefaultMaxBowlerOvers');
  const defaultPowerplay = document.getElementById('tourneyDefaultPowerplayOvers');
  const defaultQuotaBowlers = document.getElementById('tourneyDefaultQuotaBowlersCount');
  const defaultQuotaMax = document.getElementById('tourneyDefaultQuotaMaxOvers');
  const ruleCommonPlayer = document.getElementById('tourneyRuleCommonPlayer');
  const ruleJoinMidMatch = document.getElementById('tourneyRuleJoinMidMatch');
  const ruleSwitchMidMatch = document.getElementById('tourneyRuleSwitchMidMatch');
  const ruleNoExtras = document.getElementById('tourneyRuleNoExtras');
  const ruleLms = document.getElementById('tourneyRuleLMS');
  const ruleSingleSide = document.getElementById('tourneyRuleSingleSide');
  const ruleUnequal = document.getElementById('tourneyRuleUnequal');

  if (defaultOvers) defaultOvers.value = '5';
  if (defaultMaxBowler) defaultMaxBowler.value = '2';
  if (defaultPowerplay) defaultPowerplay.value = '';
  if (defaultQuotaBowlers) defaultQuotaBowlers.value = '';
  if (defaultQuotaMax) defaultQuotaMax.value = '';
  if (ruleCommonPlayer) ruleCommonPlayer.checked = false;
  if (ruleJoinMidMatch) ruleJoinMidMatch.checked = false;
  if (ruleSwitchMidMatch) ruleSwitchMidMatch.checked = false;
  if (ruleNoExtras) ruleNoExtras.checked = false;
  if (ruleLms) ruleLms.checked = false;
  if (ruleSingleSide) ruleSingleSide.checked = false;
  if (ruleUnequal) ruleUnequal.checked = false;

  document.getElementById('tournamentModal').classList.add('active');
}

async function openEditTournamentModal(tournamentId) {
  if (!ensureSeriesAccess()) return;
  const tourneys = await window.CricStorage.listTournaments();
  const target = (tourneys || []).find(t => t.id === tournamentId);
  if (!target) {
    showToast('Series not found', 'warning');
    return;
  }

  tournamentModalMode = 'EDIT';
  editingTournamentId = tournamentId;

  const title = document.getElementById('tournamentModalTitle');
  const submit = document.getElementById('tournamentModalSubmitBtn');
  if (title) title.textContent = 'Edit Tournament Defaults';
  if (submit) submit.textContent = 'Save Defaults';

  const nameInput = document.getElementById('tourneyName');
  if (nameInput) nameInput.value = target.name || '';

  populateTournamentDefaultsForm(target);
  document.getElementById('tournamentModal').classList.add('active');
}

function closeTournamentModal() {
  document.getElementById('tournamentModal').classList.remove('active');
}

async function handleCreateTournament() {
  if (!ensureSeriesAccess()) return;
  const name = (document.getElementById('tourneyName').value || 'Premier League 2025').trim() || 'Premier League 2025';
  const oversPerInnings = Math.max(1, parseInt(document.getElementById('tourneyDefaultOvers').value, 10) || 5);
  const maxOversPerBowler = Math.max(1, parseInt(document.getElementById('tourneyDefaultMaxBowlerOvers').value, 10) || 2);
  const powerplayOversRaw = parseInt(document.getElementById('tourneyDefaultPowerplayOvers').value, 10);
  const quotaBowlersCountRaw = parseInt(document.getElementById('tourneyDefaultQuotaBowlersCount').value, 10);
  const quotaMaxOversRaw = parseInt(document.getElementById('tourneyDefaultQuotaMaxOvers').value, 10);

  const effectivePowerplay = Number.isNaN(powerplayOversRaw)
    ? null
    : normalizePowerplayOvers(powerplayOversRaw, oversPerInnings);

  const defaultSettings = {
    oversPerInnings,
    maxOversPerBowler,
    powerplayOvers: effectivePowerplay,
    quotaBowlersCount: Number.isNaN(quotaBowlersCountRaw) ? null : Math.max(0, quotaBowlersCountRaw),
    quotaMaxOvers: Number.isNaN(quotaMaxOversRaw) ? null : Math.max(0, quotaMaxOversRaw),
    gullyRules: {
      ...normalizeGullyRules(),
      commonPlayer: document.getElementById('tourneyRuleCommonPlayer').checked,
      playersJoinMidMatch: document.getElementById('tourneyRuleJoinMidMatch').checked,
      playersSwitchMidMatch: document.getElementById('tourneyRuleSwitchMidMatch').checked,
      noExtraRunsForWidesNoBalls: document.getElementById('tourneyRuleNoExtras').checked,
      lastManStanding: document.getElementById('tourneyRuleLMS').checked,
      singleSideBatting: document.getElementById('tourneyRuleSingleSide').checked,
      unequalTeams: document.getElementById('tourneyRuleUnequal').checked
    }
  };

  if (tournamentModalMode === 'EDIT' && editingTournamentId) {
    const tourneys = await window.CricStorage.listTournaments();
    const existing = (tourneys || []).find(t => t.id === editingTournamentId);
    if (!existing) {
      showToast('Series not found for update', 'warning');
      return;
    }

    const updatedTournament = {
      ...existing,
      name,
      defaultSettings: {
        ...defaultSettings,
        gullyRules: {
          ...normalizeGullyRules(existing?.defaultSettings?.gullyRules),
          commonPlayer: document.getElementById('tourneyRuleCommonPlayer').checked,
          playersJoinMidMatch: document.getElementById('tourneyRuleJoinMidMatch').checked,
          playersSwitchMidMatch: document.getElementById('tourneyRuleSwitchMidMatch').checked,
          noExtraRunsForWidesNoBalls: document.getElementById('tourneyRuleNoExtras').checked,
          lastManStanding: document.getElementById('tourneyRuleLMS').checked,
          singleSideBatting: document.getElementById('tourneyRuleSingleSide').checked,
          unequalTeams: document.getElementById('tourneyRuleUnequal').checked
        }
      }
    };

    await window.CricStorage.saveTournament(updatedTournament);
    if (activeTournament && activeTournament.id === updatedTournament.id) {
      activeTournament = updatedTournament;
    }
    closeTournamentModal();
    showToast('Series defaults updated', 'success');
    renderTournaments();
    return;
  }

  const tourney = {
    id: 'tourney_' + Date.now(),
    name,
    teams: [],
    defaultSettings
  };

  await window.CricStorage.saveTournament(tourney);
  closeTournamentModal();
  showToast('Series created', 'success');
  renderTournaments();
}

async function deleteSeries(id) {
  if (!ensureSeriesAccess()) return;
  if (confirm("Are you sure you want to delete this tournament series?")) {
    await window.CricStorage.deleteTournament(id);
    renderTournaments();
  }
}

async function renderPlayers() {
  const container = document.getElementById('playersContainer');
  if (!container) return;

  const teams = (await window.CricStorage.listTeams())
    .slice()
    .sort((a, b) => (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' }));

  container.innerHTML = '';

  if (!teams || teams.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:32px 16px; color:var(--text-muted); background:var(--color-surface-muted); border-radius:12px; border:1px solid var(--color-border);">
        <div style="font-size:36px; margin-bottom:8px;">👥</div>
        <div style="font-size:15px; font-weight:800; color:var(--color-text); margin-bottom:4px;">No saved teams yet</div>
        <p style="font-size:12px; margin-bottom:16px;">Create a new team or start a match to build your squad roster.</p>
        <button class="btn-primary" style="width:auto; padding:10px 20px; font-size:13px;" onclick="openNewTeamModal()">+ Create New Team</button>
      </div>
    `;
    return;
  }

  teams.forEach(t => {
    const pCount = (t.players || []).length;
    const card = document.createElement('div');
    card.className = 'team-card-item';
    card.style.cssText = 'background:var(--color-surface); border:1px solid var(--color-border); border-radius:14px; padding:16px; margin-bottom:12px; box-shadow:var(--shadow-card);';

    const playerListHtml = (t.players || []).map((p, idx) => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--color-border-muted); font-size:13px;">
        <span style="font-weight:700; color:var(--color-text);">${idx + 1}. ${p.name || 'Player'}</span>
        <span style="font-size:11px; color:var(--text-muted);">${p.role || 'Batter'}</span>
      </div>
    `).join('');

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="width:16px; height:16px; border-radius:50%; background:${t.colorHex || '#13a968'}; display:inline-block;"></span>
          <div>
            <div style="font-size:16px; font-weight:800; color:var(--color-text);">${escapeHtml(t.name)}</div>
            <div style="font-size:12px; color:var(--text-muted);">${pCount} player${pCount !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn" style="background:var(--color-primary-soft); color:var(--color-text-on-dark); border-color:var(--color-primary); padding:6px 10px; font-size:12px;" onclick="attachSavedTeamToSeries('${t.id}')">🏆 Attach to Series</button>
          <button class="btn" style="background:var(--color-surface-muted); padding:6px 10px; font-size:12px; border-color:var(--color-border);" onclick="toggleTeamSquadView('${t.id}')">📋 Players</button>
          <button class="btn" style="background:var(--color-danger-soft); color:var(--color-error); border-color:var(--color-error); padding:6px 8px; font-size:12px;" onclick="deleteSavedTeam('${t.id}')">🗑️</button>
        </div>
      </div>
      <div id="teamSquad_${t.id}" hidden style="margin-top:14px; padding-top:10px; border-top:1px solid var(--color-border);">
        <div style="font-size:11px; font-weight:800; color:var(--color-primary); letter-spacing:0.05em; text-transform:uppercase; margin-bottom:8px;">Squad Roster</div>
        ${playerListHtml || '<div style="font-size:12px; color:var(--text-muted);">No players in this team squad.</div>'}
      </div>
    `;
    container.appendChild(card);
  });
}

async function renderGlobalPlayers() {
  const container = document.getElementById('globalPlayersContainer');
  if (!container) return;

  const players = (await window.CricStorage.listGlobalPlayers())
    .slice()
    .sort((a, b) => (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' }));

  container.replaceChildren();
  if (!players.length) {
    container.innerHTML = '<div style="text-align:center; padding:32px 16px; color:var(--text-muted); background:var(--color-surface-muted); border-radius:12px; border:1px solid var(--color-border);">No global players yet. Add a player to use them in Quick Match squads.</div>';
    return;
  }

  players.forEach(player => {
    const card = document.createElement('div');
    card.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:12px; background:var(--color-surface); border:1px solid var(--color-border); border-radius:12px; padding:12px; margin-bottom:8px;';
    const details = document.createElement('div');
    const name = document.createElement('div');
    name.style.cssText = 'font-size:14px; font-weight:800; color:var(--color-text);';
    name.textContent = player.name || 'Player';
    const role = document.createElement('div');
    role.style.cssText = 'font-size:11px; color:var(--text-muted); margin-top:2px;';
    role.textContent = `${player.role || 'Batter'}${player.style ? ` · ${player.style}` : ''}`;
    details.append(name, role);
    const edit = document.createElement('button');
    edit.className = 'btn';
    edit.style.cssText = 'width:auto; padding:6px 10px; font-size:12px; background:var(--color-surface-muted); color:var(--color-text); border-color:var(--color-border);';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => editGlobalPlayer(player.id));
    card.append(details, edit);
    container.appendChild(card);
  });
}

function setPlayersDirectoryTab(tab) {
  if (!['TEAMS', 'GLOBAL'].includes(tab)) return;
  playersDirectoryTab = tab;
  const showGlobal = tab === 'GLOBAL';
  document.getElementById('playersContainer').hidden = showGlobal;
  document.getElementById('globalPlayersContainer').hidden = !showGlobal;
  document.getElementById('playersCreateTeamBtn').hidden = showGlobal;
  document.getElementById('playersAddGlobalBtn').hidden = !showGlobal;
  const teamsTab = document.getElementById('playersTabTeams');
  const globalTab = document.getElementById('playersTabGlobal');
  if (teamsTab) teamsTab.style.background = showGlobal ? 'transparent' : 'var(--primary-color)';
  if (globalTab) globalTab.style.background = showGlobal ? 'var(--primary-color)' : 'transparent';
}

function toggleTeamSquadView(teamId) {
  const squadEl = document.getElementById(`teamSquad_${teamId}`);
  if (squadEl) {
    squadEl.hidden = !squadEl.hidden;
  }
}

async function deleteSavedTeam(teamId) {
  if (confirm('Are you sure you want to delete this saved team?')) {
    await window.CricStorage.deleteTeam(teamId);
    showToast('Team deleted successfully', 'info');
    renderPlayers();
  }
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
  seriesTeamGlobalPlayerCache = [];
  renderPlayers();
  await populateSeriesTeamPlayerPicker();
  await refreshPlayerPickOptions();
}

function renderSeriesTeamSelectedPlayers() {
  const listEl = document.getElementById('seriesTeamSelectedPlayers');
  if (!listEl) return;

  if (!seriesTeamSelectedPlayers.length) {
    listEl.innerHTML = '<div style="font-size:11px; color:var(--text-muted);">No players selected from directory yet.</div>';
    return;
  }

  const sortedSelected = [...seriesTeamSelectedPlayers].sort((a, b) =>
    (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' })
  );

  listEl.innerHTML = sortedSelected.map(p => `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; background:var(--color-surface-soft); border:1px solid var(--color-border); border-radius:8px; padding:6px 8px; margin-top:6px;">
      <span style="font-size:12px; color:var(--color-text);">${escapeHtml(p.name)}</span>
      <button class="btn" style="background:var(--color-danger-soft); color:var(--color-error); border-color:var(--color-error); width:auto; padding:2px 8px; font-size:11px;" onclick="removeSeriesTeamPlayer('${p.id}')">Remove</button>
    </div>
  `).join('');
}

async function populateSeriesTeamPlayerPicker() {
  const pickEl = document.getElementById('seriesTeamPlayerPick');
  const checklistEl = document.getElementById('seriesTeamPlayerChecklist');
  const searchEl = document.getElementById('seriesTeamPlayerSearch');

  const players = await window.CricStorage.listGlobalPlayers();
  seriesTeamGlobalPlayerCache = (Array.isArray(players) ? players : [])
    .slice()
    .sort((a, b) => (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' }));

  filterSeriesTeamPlayerPicker();
}

function getPlayerSeriesTeamStatus(player, currentModalTeamName = '') {
  if (seriesTeamSelectedPlayers.some(sp => sp.id === player.id || sp.name.toLowerCase() === player.name.toLowerCase())) {
    const labelName = currentModalTeamName ? `In ${currentModalTeamName}` : 'Already Added';
    return { label: labelName, color: 'var(--color-success)' };
  }

  if (activeTournament && Array.isArray(activeTournament.teams)) {
    for (const team of activeTournament.teams) {
      if ((team.players || []).some(p => p.id === player.id || p.name.toLowerCase() === player.name.toLowerCase())) {
        return { label: `In ${team.name}`, color: 'var(--color-info)' };
      }
    }
  }

  return { label: 'Unassigned', color: 'var(--color-text-subtle)' };
}

function filterSeriesTeamPlayerPicker() {
  const pickEl = document.getElementById('seriesTeamPlayerPick');
  const checklistEl = document.getElementById('seriesTeamPlayerChecklist');
  const searchEl = document.getElementById('seriesTeamPlayerSearch');
  if (!pickEl || !checklistEl) return;

  const searchQuery = (searchEl?.value || '').trim().toLowerCase();
  const filteredPlayers = searchQuery
    ? seriesTeamGlobalPlayerCache.filter(p => (p.name || '').toLowerCase().includes(searchQuery))
    : seriesTeamGlobalPlayerCache;

  if (!filteredPlayers.length) {
    pickEl.innerHTML = '<option value="">No matching players</option>';
    pickEl.disabled = true;
    checklistEl.innerHTML = '<div style="font-size:11px; color:var(--text-muted);">No matching players</div>';
    return;
  }

  const currentModalTeamName = document.getElementById('newTeamName')?.value.trim() || 'This Team';

  pickEl.disabled = false;
  pickEl.innerHTML = '<option value="">Select player from directory</option>' +
    filteredPlayers.map(p => {
      const status = getPlayerSeriesTeamStatus(p, currentModalTeamName);
      return `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.role || 'Batter')}) • [${escapeHtml(status.label)}]</option>`;
    }).join('');

  checklistEl.innerHTML = filteredPlayers.map((p, idx) => {
    const isAlreadySelected = seriesTeamSelectedPlayers.some(sp => sp.id === p.id || sp.name.toLowerCase() === p.name.toLowerCase());
    const status = getPlayerSeriesTeamStatus(p, currentModalTeamName);
    const inputId = `chk_series_${idx}`;

    return `
      <label for="${inputId}" style="display:flex; align-items:center; justify-content:space-between; padding:4px 0; font-size:12px; color:var(--color-text); cursor:pointer; border-bottom:1px solid var(--color-border);">
        <div style="display:flex; align-items:center; gap:6px;">
          <input id="${inputId}" type="checkbox" value="${p.id}" ${isAlreadySelected ? 'checked disabled' : ''} style="accent-color:var(--primary-color);">
          <span style="font-weight:600;">${escapeHtml(p.name)}</span>
          <span style="font-size:10px; color:var(--text-muted);">(${p.role || 'Batter'})</span>
        </div>
        <span style="font-size:10px; font-weight:800; color:${status.color}; background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px;">${status.label}</span>
      </label>
    `;
  }).join('');
}

function addCheckedSeriesTeamPlayers() {
  const checklistEl = document.getElementById('seriesTeamPlayerChecklist');
  if (!checklistEl) return;

  const checkedInputs = Array.from(checklistEl.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)'));
  if (!checkedInputs.length) {
    showToast('Select at least one player to add', 'warning');
    return;
  }

  let addedCount = 0;
  checkedInputs.forEach(input => {
    const pId = input.value;
    const selected = seriesTeamGlobalPlayerCache.find(p => p.id === pId);
    if (selected && !seriesTeamSelectedPlayers.some(sp => sp.id === selected.id)) {
      seriesTeamSelectedPlayers.push({
        id: selected.id,
        name: selected.name,
        role: selected.role || 'Batter',
        style: selected.style || 'RHB'
      });
      addedCount++;
    }
  });

  renderSeriesTeamSelectedPlayers();
  filterSeriesTeamPlayerPicker();

  if (addedCount > 0) {
    showToast(`Added ${addedCount} player${addedCount > 1 ? 's' : ''} to squad`, 'success');
  }
}

function removeSeriesTeamPlayer(playerId) {
  seriesTeamSelectedPlayers = seriesTeamSelectedPlayers.filter(p => p.id !== playerId);
  renderSeriesTeamSelectedPlayers();
  filterSeriesTeamPlayerPicker();
}

async function addSeriesTeamPlayerFromPicker() {
  const pickEl = document.getElementById('seriesTeamPlayerPick');
  if (!pickEl) return;

  const playerId = pickEl.value;
  if (!playerId) return;

  const selected = seriesTeamGlobalPlayerCache.find(p => p.id === playerId);
  if (!selected) return;

  const alreadyExists = seriesTeamSelectedPlayers.some(p => p.id === selected.id);
  if (!alreadyExists) {
    seriesTeamSelectedPlayers.push({
      id: selected.id,
      name: selected.name,
      role: selected.role || 'Batter',
      style: selected.style || 'RHB'
    });
  }

  pickEl.value = '';
  renderSeriesTeamSelectedPlayers();
  filterSeriesTeamPlayerPicker();
}

async function openNewTeamModal(tournamentId = null) {
  if (tournamentId) {
    const tourneys = await window.CricStorage.listTournaments();
    const target = (tourneys || []).find(t => t.id === tournamentId);
    if (target) {
      activeTournament = target;
    }
  } else {
    activeTournament = null;
  }

  const contextEl = document.getElementById('teamModalContext');
  if (contextEl) {
    contextEl.innerText = activeTournament?.name
      ? `Series Squad = embedded in tournament standings (${activeTournament.name}). Players are also saved to Global Directory.`
      : 'Global Team = reusable across quick matches and available for selection in series squads.';
  }

  // Handle Attach Saved Team section
  const attachSection = document.getElementById('attachSavedTeamSection');
  const savedSelect = document.getElementById('savedTeamSelect');
  if (attachSection && savedSelect) {
    if (activeTournament) {
      const savedTeams = await window.CricStorage.listTeams();
      const attachedIds = (activeTournament.teams || []).map(t => t.id);
      const attachedNames = (activeTournament.teams || []).map(t => (t.name || '').toLowerCase().trim());
      const availableSaved = (savedTeams || []).filter(st =>
        !attachedIds.includes(st.id) && !attachedNames.includes((st.name || '').toLowerCase().trim())
      );

      if (availableSaved.length > 0) {
        savedSelect.innerHTML = availableSaved.map(st =>
          `<option value="${st.id}">${st.name} (${(st.players || []).length} Players)</option>`
        ).join('');
        attachSection.hidden = false;
      } else {
        attachSection.hidden = true;
      }
    } else {
      attachSection.hidden = true;
    }
  }

  const newTeamNameEl = document.getElementById('newTeamName');
  if (newTeamNameEl) newTeamNameEl.value = '';
  const manualPlayersEl = document.getElementById('newTeamPlayers');
  if (manualPlayersEl) manualPlayersEl.value = '';
  const searchEl = document.getElementById('seriesTeamPlayerSearch');
  if (searchEl) searchEl.value = '';

  seriesTeamSelectedPlayers = [];
  await populateSeriesTeamPlayerPicker();
  renderSeriesTeamSelectedPlayers();
  document.getElementById('teamModal').classList.add('active');
}

async function handleAttachSavedTeam() {
  const selectEl = document.getElementById('savedTeamSelect');
  if (!selectEl) return;
  const teamId = selectEl.value;
  if (!teamId || !activeTournament) return;

  const savedTeams = await window.CricStorage.listTeams();
  const targetTeam = savedTeams.find(t => t.id === teamId);
  if (!targetTeam) {
    showToast('Saved team not found', 'warning');
    return;
  }

  // Attach saved team to activeTournament
  activeTournament.teams = [...(activeTournament.teams || []).filter(t => t.id !== targetTeam.id), targetTeam];
  await window.CricStorage.saveTournament(activeTournament);

  // Mirror team players to global directory
  for (const p of targetTeam.players || []) {
    await window.CricStorage.addGlobalPlayer(p);
  }

  showToast(`Attached "${targetTeam.name}" to ${activeTournament.name}!`, 'success');
  closeTeamModal();
  renderTournaments();
}

async function attachSavedTeamToSeries(teamId) {
  const tourneys = await window.CricStorage.listTournaments();
  if (!tourneys || tourneys.length === 0) {
    showToast('No tournament series created yet. Click "+ New Series" first!', 'warning');
    return;
  }

  const savedTeams = await window.CricStorage.listTeams();
  const team = savedTeams.find(t => t.id === teamId);
  if (!team) return;

  if (tourneys.length === 1) {
    const tourney = tourneys[0];
    tourney.teams = [...(tourney.teams || []).filter(t => t.id !== team.id), team];
    await window.CricStorage.saveTournament(tourney);
    showToast(`Attached "${team.name}" to ${tourney.name}!`, 'success');
    renderPlayers();
    return;
  }

  const tourneyListStr = tourneys.map((t, idx) => `${idx + 1}. ${t.name}`).join('\n');
  const pickIndexStr = prompt(`Select Series number to attach "${team.name}":\n${tourneyListStr}`, '1');
  const pickIdx = parseInt(pickIndexStr, 10) - 1;
  if (!isNaN(pickIdx) && tourneys[pickIdx]) {
    const selectedTourney = tourneys[pickIdx];
    selectedTourney.teams = [...(selectedTourney.teams || []).filter(t => t.id !== team.id), team];
    await window.CricStorage.saveTournament(selectedTourney);
    showToast(`Attached "${team.name}" to ${selectedTourney.name}!`, 'success');
    renderPlayers();
  }
}

function toggleSeriesTeamRoster(tournamentId, teamId) {
  const el = document.getElementById(`seriesTeamRoster_${tournamentId}_${teamId}`);
  if (el) el.hidden = !el.hidden;
}

async function removeSeriesTeam(tournamentId, teamId) {
  const tourneys = await window.CricStorage.listTournaments();
  const target = (tourneys || []).find(t => t.id === tournamentId);
  if (!target) return;

  if (confirm('Are you sure you want to remove this team from the series?')) {
    target.teams = (target.teams || []).filter(tm => tm.id !== teamId);
    await window.CricStorage.saveTournament(target);
    showToast('Team detached from series', 'info');
    renderTournaments();
  }
}

async function autoGenerateRoundRobinFixtures(tournamentId) {
  const tourneys = await window.CricStorage.listTournaments();
  const target = (tourneys || []).find(t => t.id === tournamentId);
  if (!target || !target.teams || target.teams.length < 2) {
    showToast('Add at least 2 teams to generate fixtures', 'warning');
    return;
  }

  const d = getTournamentDefaults(target);
  const existingFixtures = Array.isArray(target.fixtures) ? target.fixtures : [];
  const teams = target.teams;
  let createdCount = 0;

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const teamAId = teams[i].id;
      const teamBId = teams[j].id;

      const exists = existingFixtures.some(f =>
        (f.teamAId === teamAId && f.teamBId === teamBId) ||
        (f.teamAId === teamBId && f.teamBId === teamAId)
      );

      if (!exists) {
        existingFixtures.push({
          id: `fix_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          teamAId,
          teamBId,
          scheduledAt: null,
          oversPerInnings: d.oversPerInnings || 5,
          maxOversPerBowler: d.maxOversPerBowler || 2,
          powerplayOvers: d.powerplayOvers || null,
          quotaBowlersCount: d.quotaBowlersCount || null,
          quotaMaxOvers: d.quotaMaxOvers || null,
          status: 'SCHEDULED',
          linkedMatchId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        createdCount++;
      }
    }
  }

  if (createdCount > 0) {
    target.fixtures = existingFixtures;
    await window.CricStorage.saveTournament(target);
    showToast(`Generated ${createdCount} round-robin fixture${createdCount !== 1 ? 's' : ''}`, 'success');
    renderTournaments();
  } else {
    showToast('All round-robin fixtures are already scheduled', 'info');
  }
}

function closeTeamModal() {
  seriesTeamSelectedPlayers = [];
  seriesTeamGlobalPlayerCache = [];
  const searchEl = document.getElementById('seriesTeamPlayerSearch');
  if (searchEl) searchEl.value = '';
  document.getElementById('teamModal').classList.remove('active');
}

async function handleCreateTeam() {
  const name = document.getElementById('newTeamName').value;
  const color = document.getElementById('newTeamColor').value;
  const playersStr = (document.getElementById('newTeamPlayers').value || '').trim();
  if (!name) return;

  const manualNames = playersStr
    .split(',')
    .map(pName => pName.trim())
    .filter(Boolean);

  const mergedPlayersMap = new Map();

  seriesTeamSelectedPlayers.forEach(p => {
    const key = (p.name || '').trim().toLowerCase();
    if (!key) return;
    mergedPlayersMap.set(key, {
      id: p.id,
      name: p.name,
      role: p.role || 'Batter',
      style: p.style || 'RHB'
    });
  });

  manualNames.forEach((playerName, idx) => {
    const key = playerName.toLowerCase();
    if (mergedPlayersMap.has(key)) return;
    mergedPlayersMap.set(key, {
      id: `tp_${idx}_${Date.now()}`,
      name: playerName,
      role: 'Batter',
      style: 'RHB'
    });
  });

  const finalPlayers = Array.from(mergedPlayersMap.values());
  if (!finalPlayers.length) {
    showToast('Add at least one player from directory or manual input', 'warning');
    return;
  }

  const newTeam = {
    id: 'team_' + Date.now(),
    name,
    colorHex: color,
    players: finalPlayers
  };

  if (activeTournament) {
    activeTournament.teams = [...(activeTournament.teams || []).filter(t => t.id !== newTeam.id), newTeam];
    await window.CricStorage.saveTournament(activeTournament);
  }

  await window.CricStorage.saveTeam(newTeam);

  for (const p of newTeam.players) {
    await window.CricStorage.addGlobalPlayer(p);
  }

  seriesTeamGlobalPlayerCache = [];
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
  seriesTeamGlobalPlayerCache = [];
  renderPlayers();
  await populateSeriesTeamPlayerPicker();
  await refreshPlayerPickOptions();
}

async function deletePlayer(id) {
  if (confirm("Are you sure you want to delete this player from the global directory?")) {
    await window.CricStorage.deleteGlobalPlayer(id);
    showToast("Player deleted", "info");
    seriesTeamGlobalPlayerCache = [];
    renderPlayers();
    await populateSeriesTeamPlayerPicker();
    await refreshPlayerPickOptions();
  }
}
