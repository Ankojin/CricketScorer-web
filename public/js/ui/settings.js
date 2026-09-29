// settings UI module.
function updateDeviceSyncStatus() {
  const el = document.getElementById('deviceSyncStatus');
  if (!el) return;

  const endpoint = window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0
    ? window.CRIC_API_BASE
    : 'Local-only (no cloud endpoint configured)';
  const net = navigator.onLine ? 'Online' : 'Offline';
  const mode = localStorage.getItem('cric_user_mode') || 'UNKNOWN';

  el.innerText = `Mode: ${mode} | Network: ${net} | Endpoint: ${endpoint}`;
}

function triggerImportMatchBackup() {
  const input = document.getElementById('importMatchFileInput');
  if (!input) return;
  input.value = '';
  input.click();
}

async function exportActiveMatchBackup() {
  if (!activeMatch) {
    showToast('No active match to export', 'warning');
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'CricLeague',
    match: activeMatch
  };
  const safeName = (activeMatch.tournamentName || activeMatch.id || 'match').replace(/[^a-z0-9_-]+/gi, '_');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${safeName}_backup.json`);
  showToast('Match backup exported', 'success');
}

async function handleImportMatchBackup(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const source = parsed?.match || parsed;

    if (!source || !source.teamA || !source.teamB || !Array.isArray(source.ballHistory)) {
      showToast('Invalid match backup file', 'warning');
      return;
    }

    const imported = {
      ...source,
      id: `match_${Date.now()}`,
      updatedAt: new Date().toISOString()
    };

    const recalculated = window.ScoringEngine.recalculateMatch(imported);
    await window.CricStorage.createMatch(recalculated);
    showToast('Match backup imported', 'success');
    await selectMatch(recalculated.id);
  } catch (err) {
    showToast('Failed to import match backup', 'danger');
  }
}

function normalizeGullyRules(rules) {
  return {
    commonPlayer: Boolean(rules?.commonPlayer),
    unequalTeams: Boolean(rules?.unequalTeams),
    playersJoinMidMatch: Boolean(rules?.playersJoinMidMatch),
    playersSwitchMidMatch: Boolean(rules?.playersSwitchMidMatch),
    lastManStanding: Boolean(rules?.lastManStanding),
    singleSideBatting: Boolean(rules?.singleSideBatting),
    noExtraRunsForWidesNoBalls: Boolean(rules?.noExtraRunsForWidesNoBalls)
  };
}

function openMatchSettingsModal() {
  if (!activeMatch) {
    showToast('Open a match first to access Match & Gully Rules settings', 'warning');
    return;
  }
  document.getElementById('editOversText').value = activeMatch.oversPerInnings || 5;
  document.getElementById('editMaxBowlerOvers').value = activeMatch.maxOversPerBowler || 2;
  const editPowerplay = document.getElementById('editPowerplayOvers');
  if (editPowerplay) {
    editPowerplay.value = activeMatch.powerplayOvers ? `${activeMatch.powerplayOvers}` : '';
  }
  const editQuotaBowlersCount = document.getElementById('editQuotaBowlersCount');
  if (editQuotaBowlersCount) {
    editQuotaBowlersCount.value = activeMatch.quotaBowlersCount ? `${activeMatch.quotaBowlersCount}` : '';
  }
  const editQuotaMaxOvers = document.getElementById('editQuotaMaxOvers');
  if (editQuotaMaxOvers) {
    editQuotaMaxOvers.value = activeMatch.quotaMaxOvers ? `${activeMatch.quotaMaxOvers}` : '';
  }

  const rules = activeMatch.gullyRules || {};
  document.getElementById('ruleCommonPlayer').checked = rules.commonPlayer || false;
  document.getElementById('ruleJoinMidMatch').checked = rules.playersJoinMidMatch || false;
  document.getElementById('ruleSwitchMidMatch').checked = rules.playersSwitchMidMatch || false;
  document.getElementById('ruleNoExtras').checked = rules.noExtraRunsForWidesNoBalls || false;
  document.getElementById('ruleLMS').checked = rules.lastManStanding || false;
  document.getElementById('ruleSingleSide').checked = rules.singleSideBatting || false;
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

  const lifecycleBtn = document.getElementById('btnAbandonResume');
  if (lifecycleBtn) {
    if (activeMatch.status === 'ABANDONED') {
      lifecycleBtn.innerText = '▶️ Resume Match';
      lifecycleBtn.style.background = 'var(--color-success-soft)';
      lifecycleBtn.style.color = 'var(--color-green-dark)';
    } else {
      lifecycleBtn.innerText = '⛔ Abandon Match';
      lifecycleBtn.style.background = 'var(--color-danger-soft)';
      lifecycleBtn.style.color = 'var(--color-error)';
    }
  }

  openPrimaryActionModal('matchSettingsModal');
  updateDeviceSyncStatus();
}

function closeMatchSettingsModal() {
  document.getElementById('matchSettingsModal').classList.remove('active');
}

async function saveMatchSettings() {
  if (!activeMatch) return;
  const overs = parseInt(document.getElementById('editOversText').value) || 5;
  const maxBowlerOvers = parseInt(document.getElementById('editMaxBowlerOvers').value) || 2;
  const powerplayOversRaw = parseInt(document.getElementById('editPowerplayOvers').value, 10);
  const quotaBowlersCountRaw = parseInt(document.getElementById('editQuotaBowlersCount')?.value, 10);
  const quotaMaxOversRaw = parseInt(document.getElementById('editQuotaMaxOvers')?.value, 10);

  activeMatch.oversPerInnings = overs;
  activeMatch.maxOversPerBowler = maxBowlerOvers;
  activeMatch.powerplayOvers = normalizePowerplayOvers(powerplayOversRaw, overs);
  activeMatch.quotaBowlersCount = Number.isNaN(quotaBowlersCountRaw) || quotaBowlersCountRaw <= 0
    ? null
    : Math.max(1, quotaBowlersCountRaw);
  activeMatch.quotaMaxOvers = Number.isNaN(quotaMaxOversRaw) || quotaMaxOversRaw <= 0
    ? null
    : Math.max(1, quotaMaxOversRaw);

  const selectA = document.getElementById('editTeamAWK');
  const selectB = document.getElementById('editTeamBWK');
  if (selectA) activeMatch.teamAWicketKeeperId = selectA.value || null;
  if (selectB) activeMatch.teamBWicketKeeperId = selectB.value || null;

  const currentRules = normalizeGullyRules(activeMatch.gullyRules);
  activeMatch.gullyRules = {
    ...currentRules,
    commonPlayer: document.getElementById('ruleCommonPlayer').checked,
    playersJoinMidMatch: document.getElementById('ruleJoinMidMatch').checked,
    playersSwitchMidMatch: document.getElementById('ruleSwitchMidMatch').checked,
    noExtraRunsForWidesNoBalls: document.getElementById('ruleNoExtras').checked,
    lastManStanding: document.getElementById('ruleLMS').checked,
    singleSideBatting: document.getElementById('ruleSingleSide').checked,
    unequalTeams: document.getElementById('ruleUnequal').checked
  };

  const currentPending = activeMatch.pendingAction;

  if (currentPending === 'SELECT_WK_A' && !activeMatch.teamAWicketKeeperId) {
    showToast('Team A wicket-keeper is required to continue', 'warning');
    return;
  }
  if (currentPending === 'SELECT_WK_B' && !activeMatch.teamBWicketKeeperId) {
    showToast('Team B wicket-keeper is required to continue', 'warning');
    return;
  }

  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  if (currentPending === 'SELECT_WK_A' || currentPending === 'SELECT_WK_B' || currentPending === 'SELECT_MATCH_SETTINGS') {
    clearPendingAction();
  }
  await window.CricStorage.saveMatch(activeMatch);

  closeMatchSettingsModal();
  renderLiveScoring();

  if ((currentPending === 'SELECT_WK_A' || currentPending === 'SELECT_WK_B') && pendingFielderWicketType === 'STUMPED') {
    requestPendingAction('SELECT_FIELDER');
  }
}

async function toggleMatchAbandonedStatus() {
  if (!activeMatch || isReadOnlySpectator) return;

  const toLive = activeMatch.status === 'ABANDONED';
  const confirmation = toLive
    ? 'Resume this match and allow scoring again?'
    : 'Mark this match as ABANDONED and lock scoring actions?';

  if (!confirm(confirmation)) return;

  if (toLive) {
    activeMatch.status = 'LIVE';
  } else {
    activeMatch.status = 'ABANDONED';
    activeMatch.pendingAction = 'NONE';
    activeMatch.winnerId = null;
  }

  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  activeMatch = await window.CricStorage.saveMatch(activeMatch);

  closeMatchSettingsModal();
  renderLiveScoring();
  showToast(toLive ? 'Match resumed' : 'Match marked as ABANDONED', toLive ? 'success' : 'warning');
}

async function wipeAllAppData() {
  if (confirm("Are you sure you want to wipe all local app data?")) {
    await window.CricStorage.resetAllData();
    activeMatch = null;
    activeTournament = null;
    location.reload();
  }
}
