// Match setup, team selection, and toss UI.
function updateQuickMatchProgress(currentStep) {
  document.querySelectorAll('[data-quick-match-progress]').forEach(stepEl => {
    const step = Number(stepEl.dataset.quickMatchProgress);
    const isCurrent = step === currentStep;
    stepEl.classList.toggle('is-current', isCurrent);
    stepEl.classList.toggle('is-complete', step < currentStep);
    if (isCurrent) stepEl.setAttribute('aria-current', 'step');
    else stepEl.removeAttribute('aria-current');
  });
}

function setQuickMatchStep(step) {
  const nextStep = Number(step);
  if (!Number.isInteger(nextStep) || nextStep < 0 || nextStep > 2) return;
  activeQuickMatchStep = nextStep;
  document.querySelectorAll('[data-quick-match-step]').forEach(panel => {
    panel.hidden = Number(panel.dataset.quickMatchStep) !== activeQuickMatchStep;
  });

  const back = document.getElementById('quickMatchBack');
  const next = document.getElementById('quickMatchContinue');
  const start = document.getElementById('quickMatchStart');
  if (back) back.hidden = activeQuickMatchStep === 0;
  if (next) next.hidden = activeQuickMatchStep === 2;
  if (start) start.hidden = activeQuickMatchStep !== 2;
  updateQuickMatchProgress(activeQuickMatchStep);
}

function isFixtureContextLocked() {
  return currentMatchSetupSource === 'SERIES' && Boolean(pendingSeriesFixtureContext?.fixtureId);
}

function syncOversUiFromInputs() {
  const matchOversInput = document.getElementById('matchOvers');
  const display = document.getElementById('oversValueDisplay');
  const maxBowlerInput = document.getElementById('maxBowlerOvers');
  const oversValue = parseInt(matchOversInput?.value, 10) || 6;

  if (display) display.innerText = `${oversValue}`;

  if (maxBowlerInput) {
    maxBowlerInput.max = `${oversValue}`;
    const currentMax = parseInt(maxBowlerInput.value, 10) || 1;
    maxBowlerInput.value = `${Math.max(1, Math.min(oversValue, currentMax))}`;
  }

  document.querySelectorAll('.overs-pill').forEach(pill => {
    pill.classList.toggle('active', parseInt(pill.innerText, 10) === oversValue);
  });
}

function applyFixtureSettingsUiState() {
  const locked = isFixtureContextLocked();
  const oversPanel = document.getElementById('wizardPanelOvers');
  const noteId = 'fixtureSettingsLockNote';
  let note = document.getElementById(noteId);

  if (locked && oversPanel && !note) {
    note = document.createElement('div');
    note.id = noteId;
    note.className = 'fixture-settings-note';
    note.textContent = 'Fixture settings are prefilled and locked. Continue to toss.';
    oversPanel.insertBefore(note, oversPanel.firstChild);
  }

  if (!locked && note) {
    note.remove();
  }

  document.querySelectorAll('.overs-stepper-btn, .overs-pill').forEach(control => {
    control.disabled = locked;
    control.setAttribute('aria-disabled', `${locked}`);
  });

  ['matchOvers', 'maxBowlerOvers', 'matchPowerplayOvers', 'quotaBowlersCount', 'quotaMaxOvers'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.disabled = locked;
      element.setAttribute('aria-disabled', `${locked}`);
    }
  });
}

function nextQuickMatchStep() {
  if (activeQuickMatchStep === 1) {
    if (matchSquadA.length < 1) {
      showToast('Please add at least 1 player to Team A squad', 'warning');
      return;
    }
    if (matchSquadB.length < 1) {
      showToast('Please add at least 1 player to Team B squad', 'warning');
      return;
    }
  }
  setQuickMatchStep(activeQuickMatchStep + 1);
}

function previousQuickMatchStep() {
  setQuickMatchStep(activeQuickMatchStep - 1);
}

async function getAllTeamsList() {
  const globalTeams = await window.CricStorage.listTeams();
  let tourneyTeams = [];
  if (currentMatchSetupSource === 'SERIES' && activeTournament && activeTournament.teams) {
    tourneyTeams = activeTournament.teams;
  }

  if (currentMatchSetupSource === 'SERIES') {
    return [...tourneyTeams];
  }

  const map = new Map();
  [...globalTeams, ...tourneyTeams].forEach(t => {
    if (t && t.id) map.set(t.id, t);
  });
  return Array.from(map.values());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
        <span>${idx + 1}. ${escapeHtml(p.name)}</span>
        ${p.isCaptain ? '<span class="badge-c">(C)</span>' : ''}
        ${p.isViceCaptain ? '<span class="badge-vc">(VC)</span>' : ''}
      </div>
      <div class="squad-btn-group">
        <button class="role-btn ${p.isCaptain ? 'active-c' : ''}" onclick="setSquadRole('${side}', ${idx}, 'C')">C</button>
        <button class="role-btn ${p.isViceCaptain ? 'active-vc' : ''}" onclick="setSquadRole('${side}', ${idx}, 'VC')">VC</button>
        <button class="role-btn" style="background:var(--color-surface-soft); color:var(--color-text);" title="Move to Team ${side === 'A' ? 'B' : 'A'}" onclick="movePlayerToOtherSquad('${side}', ${idx})">⇄ Move</button>
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
  if (existingInOther && !isCommonPlayerRuleEnabled()) {
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

  const newPlayerId = existingInOther ? existingInOther.id : `p_${side.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  thisSquad.push({
    id: newPlayerId,
    name: rawName,
    isCaptain: thisSquad.length === 0,
    isViceCaptain: thisSquad.length === 1
  });

  // Master List & Series Linking: Automatically register new player in Global Master List & Series Roster
  window.CricStorage.addGlobalPlayer({
    id: newPlayerId,
    name: rawName,
    role: 'Batter',
    style: 'RHB'
  });

  if (activeTournament && Array.isArray(activeTournament.teams)) {
    const tourneyTeam = activeTournament.teams.find(t => t.name === thisTeamName);
    if (tourneyTeam) {
      tourneyTeam.players = tourneyTeam.players || [];
      if (!tourneyTeam.players.some(p => p.id === newPlayerId || p.name.toLowerCase() === rawName.toLowerCase())) {
        tourneyTeam.players.push({ id: newPlayerId, name: rawName, role: 'Batter', style: 'RHB' });
        window.CricStorage.saveTournament(activeTournament);
      }
    }
  }

  inputEl.value = '';
  renderSquadList(side);
  refreshPlayerPickOptions();
}

function addPickedPlayerToSquad(side) {
  const selectEl = document.getElementById(side === 'A' ? 'selectGlobalPlayerA' : 'selectGlobalPlayerB');
  if (!selectEl || !selectEl.value) return;

  try {
    const pObj = JSON.parse(selectEl.value);
    if (addPlayerObjectToSquad(side, pObj)) {
      selectEl.value = '';
      renderSquadList('A');
      renderSquadList('B');
      refreshPlayerPickOptions();
    }
  } catch (e) {
    console.warn('Error adding picked player:', e);
  }
}

function addPlayerObjectToSquad(side, pObj) {
  if (!pObj || !pObj.name) return false;

  const thisSquad = side === 'A' ? matchSquadA : matchSquadB;
  const otherSquad = side === 'A' ? matchSquadB : matchSquadA;

  const thisTeamName = document.getElementById(side === 'A' ? 'teamAName' : 'teamBName').value.trim() || `Team ${side}`;
  const otherTeamName = document.getElementById(side === 'A' ? 'teamBName' : 'teamAName').value.trim() || `Team ${side === 'A' ? 'B' : 'A'}`;

  const existsInThis = thisSquad.some(p => p.id === pObj.id || p.name.toLowerCase() === pObj.name.toLowerCase());
  if (existsInThis) {
    showToast(`"${pObj.name}" is already in this squad`, 'warning');
    return false;
  }

  const existingInOther = otherSquad.find(p => p.id === pObj.id || p.name.toLowerCase() === pObj.name.toLowerCase());
  if (existingInOther && !isCommonPlayerRuleEnabled()) {
    if (confirm(`"${pObj.name}" is already in ${otherTeamName}. Move to ${thisTeamName}?`)) {
      if (side === 'A') {
        matchSquadB = matchSquadB.filter(p => p.id !== existingInOther.id);
      } else {
        matchSquadA = matchSquadA.filter(p => p.id !== existingInOther.id);
      }
    } else {
      return false;
    }
  }

  thisSquad.push({
    id: pObj.id || `p_${side.toLowerCase()}_${Date.now()}`,
    name: pObj.name,
    isCaptain: thisSquad.length === 0,
    isViceCaptain: thisSquad.length === 1
  });

  return true;
}

function onAddGlobalPlayer(side) { addPickedPlayerToSquad(side); }

function onAddNewPlayerInput(side) { addTypedPlayerToSquad(side); }

function filterGlobalPlayerOptions(side) {
  renderGlobalPlayerOptionsForSide(side);
}

function addSelectedDirectoryPlayers(side) {
  const checklistEl = document.getElementById(side === 'A' ? 'globalPlayerChecklistA' : 'globalPlayerChecklistB');
  if (!checklistEl) return;

  const checked = Array.from(checklistEl.querySelectorAll('input[type="checkbox"]:checked'));
  if (!checked.length) {
    showToast('Select at least one player to add', 'warning');
    return;
  }

  let addedCount = 0;
  checked.forEach(input => {
    try {
      const pObj = JSON.parse(decodeURIComponent(input.value));
      if (addPlayerObjectToSquad(side, pObj)) {
        addedCount += 1;
      }
    } catch (e) {
      console.warn('Invalid player payload in checklist:', e);
    }
  });

  renderSquadList('A');
  renderSquadList('B');
  refreshPlayerPickOptions();

  if (addedCount > 0) {
    showToast(`Added ${addedCount} player${addedCount > 1 ? 's' : ''} to Team ${side}`, 'success');
  }
}

function renderGlobalPlayerOptionsForSide(side) {
  const selectEl = document.getElementById(side === 'A' ? 'selectGlobalPlayerA' : 'selectGlobalPlayerB');
  const checklistEl = document.getElementById(side === 'A' ? 'globalPlayerChecklistA' : 'globalPlayerChecklistB');
  const searchEl = document.getElementById(side === 'A' ? 'globalPlayerSearchA' : 'globalPlayerSearchB');
  if (!selectEl || !checklistEl) return;

  const query = (searchEl?.value || '').trim().toLowerCase();
  const filtered = query
    ? matchGlobalPlayerCache.filter(p => (p.name || '').toLowerCase().includes(query))
    : matchGlobalPlayerCache;

  const squadAMap = new Map(matchSquadA.map(p => [p.name.toLowerCase(), p]));
  const squadBMap = new Map(matchSquadB.map(p => [p.name.toLowerCase(), p]));

  const teamAName = document.getElementById('teamAName').value.trim() || 'Team A';
  const teamBName = document.getElementById('teamBName').value.trim() || 'Team B';

  selectEl.innerHTML = '<option value="">-- Choose Existing Player --</option>';
  if (!filtered.length) {
    selectEl.innerHTML = '<option value="">No matching players</option>';
    selectEl.disabled = true;
    checklistEl.innerHTML = '<div style="font-size:11px; color:var(--text-muted);">No matching players</div>';
    return;
  }

  selectEl.disabled = false;
  filtered.forEach(p => {
    let statusLabel = 'Unassigned';
    if (squadAMap.has((p.name || '').toLowerCase())) {
      statusLabel = `In ${teamAName}`;
    } else if (squadBMap.has((p.name || '').toLowerCase())) {
      statusLabel = `In ${teamBName}`;
    }

    const opt = document.createElement('option');
    opt.value = JSON.stringify(p);
    opt.innerText = `${p.name} (${p.role || 'Batter'}) • [${statusLabel}]`;
    selectEl.appendChild(opt);
  });

  checklistEl.innerHTML = filtered.map((p, idx) => {
    let statusLabel = 'Unassigned';
    if (squadAMap.has((p.name || '').toLowerCase())) {
      statusLabel = `In ${teamAName}`;
    } else if (squadBMap.has((p.name || '').toLowerCase())) {
      statusLabel = `In ${teamBName}`;
    }
    const inputId = `chk_${side}_${idx}`;
    const encodedPayload = encodeURIComponent(JSON.stringify(p));
    return `
      <label for="${inputId}" style="display:flex; align-items:center; gap:6px; padding:3px 0; font-size:12px; color:var(--color-text);">
        <input id="${inputId}" type="checkbox" value="${encodedPayload}">
        <span>${p.name} (${p.role || 'Batter'}) • [${statusLabel}]</span>
      </label>
    `;
  }).join('');
}

function isAutoGeneratedGlobalPlayer(player) {
  const id = `${player?.id || ''}`;
  const name = `${player?.name || ''}`.trim();
  return id.startsWith('pla_web_')
    || id.startsWith('plb_web_')
    || /^team\s+[ab]\s+player\s+\d+$/i.test(name);
}

function normalizePlayerNameKey(name) {
  return `${name || ''}`.trim().toLowerCase();
}

async function refreshPlayerPickOptions() {
  const rawPlayers = await window.CricStorage.listGlobalPlayers();
  const uniquePlayers = new Map();
  (Array.isArray(rawPlayers) ? rawPlayers : []).forEach(player => {
    if (!player || isAutoGeneratedGlobalPlayer(player)) return;
    const key = normalizePlayerNameKey(player.name);
    if (!key || uniquePlayers.has(key)) return;
    uniquePlayers.set(key, player);
  });

  matchGlobalPlayerCache = Array.from(uniquePlayers.values())
    .sort((a, b) => (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' }));
  renderGlobalPlayerOptionsForSide('A');
  renderGlobalPlayerOptionsForSide('B');
}

function loadTeamIntoSquad(side, team) {
  if (!team) return;
  if (side === 'A') {
    document.getElementById('teamAName').value = team.name || '';
    document.getElementById('teamAColor').value = team.colorHex || '#13a968';
    matchSquadA = (team.players || []).map((p, idx) => ({
      id: p.id || `pa_${Date.now()}_${idx}`,
      name: typeof p === 'string' ? p : p.name,
      isCaptain: Boolean(p.isCaptain || idx === 0),
      isViceCaptain: Boolean(p.isViceCaptain || idx === 1)
    }));
    renderSquadList('A');
  } else {
    document.getElementById('teamBName').value = team.name || '';
    document.getElementById('teamBColor').value = team.colorHex || '#38bdf8';
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

function getTournamentDefaults(tournament) {
  const d = tournament?.defaultSettings || {};
  return {
    oversPerInnings: Number(d.oversPerInnings || 0) > 0 ? Number(d.oversPerInnings) : null,
    maxOversPerBowler: Number(d.maxOversPerBowler || 0) > 0 ? Number(d.maxOversPerBowler) : null,
    powerplayOvers: Number(d.powerplayOvers || 0) > 0 ? Number(d.powerplayOvers) : null,
    quotaBowlersCount: Number(d.quotaBowlersCount || 0) > 0 ? Number(d.quotaBowlersCount) : null,
    quotaMaxOvers: Number(d.quotaMaxOvers || 0) > 0 ? Number(d.quotaMaxOvers) : null,
    gullyRules: normalizeGullyRules(d.gullyRules)
  };
}

function isCommonPlayerRuleEnabled() {
  const defaults = getTournamentDefaults(activeTournament);

  // Series setup: tournament defaults are the source of truth.
  if (currentMatchSetupSource === 'SERIES') {
    return Boolean(defaults?.gullyRules?.commonPlayer);
  }

  // Standalone setup: use current active match settings when available.
  const activeRule = activeMatch?.gullyRules?.commonPlayer;
  if (typeof activeRule === 'boolean') {
    return activeRule;
  }

  return Boolean(defaults?.gullyRules?.commonPlayer);
}

function normalizePowerplayOvers(powerplayOvers, oversPerInnings) {
  const overs = Number(oversPerInnings || 0);
  if (overs <= 0) return null;
  const pp = Number(powerplayOvers || 0);
  if (!pp || pp <= 0) return null;
  return Math.min(pp, overs);
}

async function showNewMatchScreen(mode = 'FULL', setupContext = null) {
  currentScoringMode = mode || 'FULL';
  currentMatchSetupSource = setupContext?.source === 'SERIES' ? 'SERIES' : 'STANDALONE';
  pendingSeriesFixtureContext = currentMatchSetupSource === 'SERIES'
    ? (setupContext?.prefill || null)
    : null;

  if (currentMatchSetupSource === 'SERIES' && setupContext?.tournamentId) {
    const tourneys = await window.CricStorage.listTournaments();
    activeTournament = (tourneys || []).find(t => t.id === setupContext.tournamentId) || null;
    if (!activeTournament) {
      showToast('Series not found, opening standalone match setup', 'warning');
      currentMatchSetupSource = 'STANDALONE';
    }
  } else {
    activeTournament = null;
  }

  const isFullMatch = currentScoringMode === 'FULL';
  const isWebScore = currentScoringMode === 'WEBSCORE';
  const allowGlobalPlayerPicker = currentMatchSetupSource === 'SERIES';
  const saveForReuseEl = document.getElementById('saveTeamsForReuse');
  document.getElementById('fullMatchSetupIntro')?.toggleAttribute('hidden', !isFullMatch);
  document.getElementById('fullMatchSquadBuilder')?.toggleAttribute('hidden', !isFullMatch);
  document.getElementById('webScoreColorControls')?.toggleAttribute('hidden', !isWebScore);
  document.querySelectorAll('.web-score-player-count').forEach(el => { el.hidden = !isWebScore; });
  document.getElementById('globalPlayerPickerA')?.toggleAttribute('hidden', !allowGlobalPlayerPicker);
  document.getElementById('globalPlayerPickerB')?.toggleAttribute('hidden', !allowGlobalPlayerPicker);
  if (saveForReuseEl) {
    // Series fixtures should use already-defined squads and must not duplicate teams/players.
    saveForReuseEl.checked = currentMatchSetupSource !== 'SERIES';
  }
  matchSquadA = [];
  matchSquadB = [];

  showScreen('screenNewMatch');
  setQuickMatchStep(0);
  updateWizardStepUI(0);

  const teamAInput = document.getElementById('teamAName');
  const teamBInput = document.getElementById('teamBName');
  if (teamAInput) teamAInput.value = '';
  if (teamBInput) teamBInput.value = '';
  if (isWebScore) {
    const playerCountA = document.getElementById('teamAPlayerCount');
    const playerCountB = document.getElementById('teamBPlayerCount');
    if (playerCountA) playerCountA.value = '11';
    if (playerCountB) playerCountB.value = '11';
  }

  renderSquadList('A');
  renderSquadList('B');

  const defaults = currentMatchSetupSource === 'SERIES'
    ? getTournamentDefaults(activeTournament)
    : getTournamentDefaults(null);
  const matchOversInput = document.getElementById('matchOvers');
  const maxBowlerOversInput = document.getElementById('maxBowlerOvers');
  if (matchOversInput) {
    matchOversInput.value = `${defaults.oversPerInnings || 5}`;
  }
  if (maxBowlerOversInput) {
    maxBowlerOversInput.value = `${defaults.maxOversPerBowler || 2}`;
    maxBowlerOversInput.max = `${Number(matchOversInput?.value) || 100}`;
  }
  const powerplayInput = document.getElementById('matchPowerplayOvers');
  if (powerplayInput) {
    powerplayInput.value = defaults.powerplayOvers ? `${defaults.powerplayOvers}` : '';
  }
  const quotaBowlersInput = document.getElementById('quotaBowlersCount');
  if (quotaBowlersInput) {
    quotaBowlersInput.value = defaults.quotaBowlersCount ? `${defaults.quotaBowlersCount}` : '';
  }
  const quotaMaxOversInput = document.getElementById('quotaMaxOvers');
  if (quotaMaxOversInput) {
    quotaMaxOversInput.value = defaults.quotaMaxOvers ? `${defaults.quotaMaxOvers}` : '';
  }

  if (pendingSeriesFixtureContext) {
    if (matchOversInput && Number(pendingSeriesFixtureContext.oversPerInnings || 0) > 0) {
      matchOversInput.value = `${pendingSeriesFixtureContext.oversPerInnings}`;
    }
    if (maxBowlerOversInput && Number(pendingSeriesFixtureContext.maxOversPerBowler || 0) > 0) {
      maxBowlerOversInput.value = `${pendingSeriesFixtureContext.maxOversPerBowler}`;
    }
    if (powerplayInput) {
      powerplayInput.value = Number(pendingSeriesFixtureContext.powerplayOvers || 0) > 0
        ? `${pendingSeriesFixtureContext.powerplayOvers}`
        : '';
    }
    if (quotaBowlersInput) {
      quotaBowlersInput.value = Number(pendingSeriesFixtureContext.quotaBowlersCount || 0) > 0
        ? `${pendingSeriesFixtureContext.quotaBowlersCount}`
        : '';
    }
    if (quotaMaxOversInput) {
      quotaMaxOversInput.value = Number(pendingSeriesFixtureContext.quotaMaxOvers || 0) > 0
        ? `${pendingSeriesFixtureContext.quotaMaxOvers}`
        : '';
    }
  }

  syncOversUiFromInputs();
  applyFixtureSettingsUiState();

  const selectA = document.getElementById('selectTeamA');
  const selectB = document.getElementById('selectTeamB');

  if (selectA) selectA.innerHTML = '<option value="">-- Custom Team A --</option>';
  if (selectB) selectB.innerHTML = '<option value="">-- Custom Team B --</option>';

  if (selectA || selectB) {
    try {
      const teams = await getAllTeamsList();
      teams.forEach(t => {
        const pCount = (t.players || []).length;
        if (selectA) {
          const optA = document.createElement('option');
          optA.value = t.id;
          optA.innerText = `${t.name} (${pCount} player${pCount !== 1 ? 's' : ''})`;
          selectA.appendChild(optA);
        }

        if (selectB) {
          const optB = document.createElement('option');
          optB.value = t.id;
          optB.innerText = `${t.name} (${pCount} player${pCount !== 1 ? 's' : ''})`;
          selectB.appendChild(optB);
        }
      });

      if (pendingSeriesFixtureContext?.teamAId && selectA) {
        const preTeamA = teams.find(team => team.id === pendingSeriesFixtureContext.teamAId);
        if (preTeamA) {
          selectA.value = preTeamA.id;
          loadTeamIntoSquad('A', preTeamA);
        }
      }

      if (pendingSeriesFixtureContext?.teamBId && selectB) {
        const preTeamB = teams.find(team => team.id === pendingSeriesFixtureContext.teamBId);
        if (preTeamB) {
          selectB.value = preTeamB.id;
          loadTeamIntoSquad('B', preTeamB);
        }
      }
    } catch (e) {
      console.warn('Failed to load team select options:', e);
    }
  }

  await refreshPlayerPickOptions();
}

async function onSelectTeamAChange() {
  const selectA = document.getElementById('selectTeamA');
  if (!selectA || !selectA.value) return;
  const teamId = selectA.value;

  const teams = await getAllTeamsList();
  const found = teams.find(t => t.id === teamId);
  if (found) {
    loadTeamIntoSquad('A', found);
  }
}

async function onSelectTeamBChange() {
  const selectB = document.getElementById('selectTeamB');
  if (!selectB || !selectB.value) return;
  const teamId = selectB.value;

  const teams = await getAllTeamsList();
  const found = teams.find(t => t.id === teamId);
  if (found) {
    loadTeamIntoSquad('B', found);
  }
}

async function handleCreateMatch({ openToss = true } = {}) {
  try {
    const teamAName = document.getElementById('teamAName')?.value?.trim() || 'Team A';
    const teamAColor = document.getElementById('teamAColor')?.value || '#13a968';

    const teamBName = document.getElementById('teamBName')?.value?.trim() || 'Team B';
    const teamBColor = document.getElementById('teamBColor')?.value || '#38bdf8';

    // WebScore creates anonymous placeholder players from the selected team counts.
    if (!matchSquadA || matchSquadA.length < 1) {
      matchSquadA = [];
      const countA = currentScoringMode === 'WEBSCORE' ? getWebScorePlayerCount('A') : 11;
      for (let i = 1; i <= countA; i++) {
        matchSquadA.push({
          id: `pla_web_${Date.now()}_${i}`,
          name: `${teamAName} Player ${i}`,
          role: i === 1 ? 'BATTER' : 'ALL_ROUNDER'
        });
      }
    }

    if (!matchSquadB || matchSquadB.length < 1) {
      matchSquadB = [];
      const countB = currentScoringMode === 'WEBSCORE' ? getWebScorePlayerCount('B') : 11;
      for (let i = 1; i <= countB; i++) {
        matchSquadB.push({
          id: `plb_web_${Date.now()}_${i}`,
          name: `${teamBName} Player ${i}`,
          role: i === 1 ? 'BATTER' : 'ALL_ROUNDER'
        });
      }
    }

    const overs = parseInt(document.getElementById('matchOvers')?.value, 10) || 6;
    const maxBowlerOvers = parseInt(document.getElementById('maxBowlerOvers')?.value, 10) || Math.max(1, Math.ceil(overs / 5));
    const powerplayEl = document.getElementById('matchPowerplayOvers');
    const powerplayOversRaw = powerplayEl ? parseInt(powerplayEl.value, 10) : NaN;
    const quotaBowlersInput = document.getElementById('quotaBowlersCount');
    const quotaMaxOversInput = document.getElementById('quotaMaxOvers');
    const quotaBowlersCountRaw = quotaBowlersInput ? parseInt(quotaBowlersInput.value, 10) : NaN;
    const quotaMaxOversRaw = quotaMaxOversInput ? parseInt(quotaMaxOversInput.value, 10) : NaN;
    const seriesTournament = currentMatchSetupSource === 'SERIES' ? activeTournament : null;
    const tourneyDefaults = getTournamentDefaults(seriesTournament);
    const saveForReuseEl = document.getElementById('saveTeamsForReuse');
    const saveForReuse = currentMatchSetupSource !== 'SERIES' && (saveForReuseEl ? saveForReuseEl.checked : true);
    const effectivePowerplay = normalizePowerplayOvers(
      Number.isNaN(powerplayOversRaw) ? tourneyDefaults.powerplayOvers : powerplayOversRaw,
      overs
    );
    const effectiveQuotaBowlersCount = Number.isNaN(quotaBowlersCountRaw)
      ? tourneyDefaults.quotaBowlersCount
      : Math.max(0, quotaBowlersCountRaw);
    const effectiveQuotaMaxOvers = Number.isNaN(quotaMaxOversRaw)
      ? tourneyDefaults.quotaMaxOvers
      : Math.max(0, quotaMaxOversRaw);

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

      const seenNames = new Set();
      for (const p of [...teamA.players, ...teamB.players]) {
        if (!p || isAutoGeneratedGlobalPlayer(p)) continue;
        const nameKey = normalizePlayerNameKey(p.name);
        if (!nameKey || seenNames.has(nameKey)) continue;
        seenNames.add(nameKey);
        await window.CricStorage.addGlobalPlayer({ id: p.id, name: p.name, role: 'Batter' });
      }
    }

    activeMatch = {
      id: 'match_' + Date.now(),
      scoringMode: currentScoringMode || 'QUICK',
      tournamentId: seriesTournament?.id || null,
      tournamentName: seriesTournament?.name || null,
      seriesFixtureId: pendingSeriesFixtureContext?.fixtureId || null,
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
      powerplayOvers: effectivePowerplay,
      quotaBowlersCount: effectiveQuotaBowlersCount > 0 ? effectiveQuotaBowlersCount : null,
      quotaMaxOvers: effectiveQuotaMaxOvers > 0 ? effectiveQuotaMaxOvers : null,
      ballHistory: [],
      wicketHistory: [],
      pendingAction: 'TOSS_REQUIRED',
      gullyRules: {
        ...normalizeGullyRules(tourneyDefaults.gullyRules),
        commonPlayer: isCommonPlayerRuleEnabled()
      }
    };

    if (openToss) openTossModal();
  } catch (err) {
    console.error('Failed to create match:', err);
  }
}

async function markSeriesFixtureStartedIfNeeded(matchId) {
  if (!activeMatch?.tournamentId || !activeMatch?.seriesFixtureId) return;

  const tourneys = await window.CricStorage.listTournaments();
  const target = (tourneys || []).find(t => t.id === activeMatch.tournamentId);
  if (!target) return;

  const fixtures = Array.isArray(target.fixtures) ? target.fixtures : [];
  const idx = fixtures.findIndex(f => f.id === activeMatch.seriesFixtureId);
  if (idx < 0) return;

  fixtures[idx] = {
    ...fixtures[idx],
    linkedMatchId: matchId || fixtures[idx].linkedMatchId || null,
    status: 'LIVE',
    startedAt: fixtures[idx].startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  target.fixtures = fixtures;
  await window.CricStorage.saveTournament(target);
}

function openTossModal() {
  if (!activeMatch) return;
  updateQuickMatchProgress(3);
  const btnA = document.getElementById('tossBtnTeamA');
  const btnB = document.getElementById('tossBtnTeamB');

  if (btnA) btnA.innerText = activeMatch.teamA?.name || 'Team A';
  if (btnB) btnB.innerText = activeMatch.teamB?.name || 'Team B';

  selectedTossWinnerId = activeMatch.teamA?.id || 'teamA';
  selectedTossDecision = 'BAT';

  if (activeMatch.status === 'UPCOMING') {
    setPendingAction('TOSS_REQUIRED');
  }

  const tossResultText = document.getElementById('tossResultText');
  if (tossResultText) tossResultText.innerText = '';
  const coinImg = document.getElementById('coinImg');
  if (coinImg) coinImg.src = 'img/coin_heads.png';

  updateTossButtonsUI();
  openPrimaryActionModal('tossModal');
}

function closeTossModal() {
  if (activeMatch?.pendingAction === 'TOSS_REQUIRED') {
    showToast('Toss and decision are required before match can go live', 'warning');
    return;
  }
  document.getElementById('tossModal').classList.remove('active');
}

function spinCoinFlip() {
  const coinImg = document.getElementById('coinImg');
  const resultText = document.getElementById('tossResultText');

  if (coinImg) coinImg.classList.add('spinning');
  if (resultText) resultText.innerText = 'Flipping coin... 🪙';

  setTimeout(() => {
    const isHeads = Math.random() < 0.5;
    if (coinImg) coinImg.classList.remove('spinning');

    if (isHeads) {
      if (coinImg) coinImg.src = 'img/coin_heads.png';
      selectedTossWinnerId = activeMatch.teamA?.id || 'teamA';
      if (resultText) resultText.innerText = `🪙 Result: HEADS! (${activeMatch.teamA?.name || 'Team A'} won the toss)`;
    } else {
      if (coinImg) coinImg.src = 'img/coin_tails.png';
      selectedTossWinnerId = activeMatch.teamB?.id || 'teamB';
      if (resultText) resultText.innerText = `🪙 Result: TAILS! (${activeMatch.teamB?.name || 'Team B'} won the toss)`;
    }

    updateTossButtonsUI();
  }, 1200);
}

function selectTossWinner(teamKey) {
  if (!activeMatch) return;
  selectedTossWinnerId = teamKey === 'teamA' ? activeMatch.teamA?.id : activeMatch.teamB?.id;
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

  const choices = [
    [btnA, selectedTossWinnerId === activeMatch.teamA?.id],
    [btnB, selectedTossWinnerId === activeMatch.teamB?.id],
    [btnBat, selectedTossDecision === 'BAT'],
    [btnBowl, selectedTossDecision === 'BOWL']
  ];
  choices.forEach(([button, selected]) => {
    if (button) {
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', `${selected}`);
    }
  });
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
  clearPendingAction('TOSS_REQUIRED');

  document.getElementById('tossModal').classList.remove('active');
  activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
  try {
    await window.CricStorage.createMatch(activeMatch);
  } catch (err) {
    console.warn('Cloud createMatch failed at toss start; proceeding with local backup.', err);
    if (window.CricStorage?.saveLocalMatchBackup) {
      window.CricStorage.saveLocalMatchBackup(activeMatch);
    }
    showToast('Saved locally. Cloud sync will retry when available.', 'info');
  }

  try {
    await markSeriesFixtureStartedIfNeeded(activeMatch.id);
  } catch (err) {
    console.warn('Unable to mark series fixture as started immediately.', err);
  }

  updateQuickMatchProgress(4);
  showLiveScreen();
}

function updateWizardStepUI(stepIndex) {
  currentWizardStep = stepIndex;

  // Update wizard progress indicator
  document.querySelectorAll('.wizard-step').forEach((el, idx) => {
    el.classList.toggle('active', idx === stepIndex);
    el.classList.toggle('complete', idx < stepIndex);
  });

  // Update panels
  document.querySelectorAll('.wizard-step-panel').forEach((panel, idx) => {
    panel.hidden = idx !== stepIndex;
  });
}

function getWebScorePlayerCount(side) {
  const input = document.getElementById(side === 'A' ? 'teamAPlayerCount' : 'teamBPlayerCount');
  const parsed = Number.parseInt(input?.value, 10);
  const count = Math.min(11, Math.max(1, Number.isFinite(parsed) ? parsed : 11));
  if (input) input.value = String(count);
  return count;
}

function goToWizardTeamsStep() {
  updateWizardStepUI(0);
}

function goToWizardOversStep() {
  const teamAName = document.getElementById('teamAName')?.value?.trim() || 'Team A';
  const teamBName = document.getElementById('teamBName')?.value?.trim() || 'Team B';

  if (!teamAName) {
    showToast('Please enter Team A name', 'warning');
    return;
  }
  if (!teamBName) {
    showToast('Please enter Team B name', 'warning');
    return;
  }

  // Full/Quick modes keep default squads. WebScore generates the selected count at match creation.
  if (currentScoringMode !== 'WEBSCORE' && matchSquadA.length < 1) {
    matchSquadA = [];
    for (let i = 1; i <= 11; i++) {
      matchSquadA.push({
        id: `pla_web_${Date.now()}_${i}`,
        name: `${teamAName} Player ${i}`,
        role: i === 1 ? 'BATTER' : 'ALL_ROUNDER'
      });
    }
  }

  if (currentScoringMode !== 'WEBSCORE' && matchSquadB.length < 1) {
    matchSquadB = [];
    for (let i = 1; i <= 11; i++) {
      matchSquadB.push({
        id: `plb_web_${Date.now()}_${i}`,
        name: `${teamBName} Player ${i}`,
        role: i === 1 ? 'BATTER' : 'ALL_ROUNDER'
      });
    }
  }

  if (isFixtureContextLocked()) {
    goToWizardTossStep();
    return;
  }

  updateWizardStepUI(1);
}

function adjustMatchOvers(delta) {
  if (isFixtureContextLocked()) return;

  const matchOversInput = document.getElementById('matchOvers');
  const display = document.getElementById('oversValueDisplay');
  let val = parseInt(matchOversInput.value, 10) || 6;
  val = Math.max(1, Math.min(100, val + delta));

  matchOversInput.value = val;
  if (display) display.innerText = val;

  // Max bowler overs logic
  const maxBowlerInput = document.getElementById('maxBowlerOvers');
  if (maxBowlerInput) {
    maxBowlerInput.max = `${val}`;
    maxBowlerInput.value = Math.max(1, Math.ceil(val / 5));
  }

  // Update pills
  document.querySelectorAll('.overs-pill').forEach(pill => {
    pill.classList.toggle('active', parseInt(pill.innerText, 10) === val);
  });
}

function setQuickMatchOvers(num) {
  if (isFixtureContextLocked()) return;

  const matchOversInput = document.getElementById('matchOvers');
  const display = document.getElementById('oversValueDisplay');

  matchOversInput.value = num;
  if (display) display.innerText = num;

  const maxBowlerInput = document.getElementById('maxBowlerOvers');
  if (maxBowlerInput) {
    maxBowlerInput.max = `${num}`;
    maxBowlerInput.value = Math.max(1, Math.ceil(num / 5));
  }

  document.querySelectorAll('.overs-pill').forEach(pill => {
    pill.classList.toggle('active', parseInt(pill.innerText, 10) === num);
  });
}

function syncTeamNamesToTossUI() {
  const teamAName = document.getElementById('teamAName')?.value?.trim() || 'Team A';
  const teamBName = document.getElementById('teamBName')?.value?.trim() || 'Team B';

  const btnA = document.getElementById('tossCallTeamA');
  const btnB = document.getElementById('tossCallTeamB');
  if (btnA) btnA.innerText = teamAName;
  if (btnB) btnB.innerText = teamBName;
}

window.syncTeamNamesToTossUI = syncTeamNamesToTossUI;

function goToWizardTossStep() {
  const teamAName = document.getElementById('teamAName')?.value?.trim() || 'Team A';
  const teamBName = document.getElementById('teamBName')?.value?.trim() || 'Team B';

  const btnA = document.getElementById('tossCallTeamA');
  const btnB = document.getElementById('tossCallTeamB');
  if (btnA) btnA.innerText = teamAName;
  if (btnB) btnB.innerText = teamBName;

  selectTossCallChoice('HEADS');
  setTossDecisionChoice('BAT');
  const decisionBox = document.getElementById('tossWinnerDecisionSection');
  if (decisionBox) decisionBox.hidden = true;
  const coinImg = document.getElementById('coinImg');
  if (coinImg) coinImg.src = 'img/coin_heads.png';
  const flipButton = document.querySelector('.web-score-flip-button');
  const flipLabel = document.getElementById('webScoreFlipLabel');
  if (flipButton) {
    flipButton.disabled = false;
    flipButton.setAttribute('aria-busy', 'false');
  }
  if (flipLabel) flipLabel.textContent = 'Flip Coin';
  selectTossCaller('A');
  updateWizardStepUI(2);
}

function selectTossCallChoice(choice) {
  tossCallChoice = choice === 'TAILS' ? 'TAILS' : 'HEADS';
  const headsButton = document.getElementById('tossCallHeads');
  const tailsButton = document.getElementById('tossCallTails');
  if (headsButton) {
    const selected = tossCallChoice === 'HEADS';
    headsButton.classList.toggle('active', selected);
    headsButton.setAttribute('aria-pressed', `${selected}`);
  }
  if (tailsButton) {
    const selected = tossCallChoice === 'TAILS';
    tailsButton.classList.toggle('active', selected);
    tailsButton.setAttribute('aria-pressed', `${selected}`);
  }
  const decisionBox = document.getElementById('tossWinnerDecisionSection');
  if (decisionBox) decisionBox.hidden = true;
}

function selectTossCaller(caller) {
  tossCallerTeam = caller;
  const teamAName = document.getElementById('teamAName')?.value?.trim() || 'Team A';
  const teamBName = document.getElementById('teamBName')?.value?.trim() || 'Team B';

  const btnA = document.getElementById('tossCallTeamA');
  const btnB = document.getElementById('tossCallTeamB');
  if (btnA) btnA.classList.toggle('active', caller === 'A');
  if (btnB) btnB.classList.toggle('active', caller === 'B');

  const msg = document.getElementById('tossCallerMessage');
  if (msg) {
    const callerName = caller === 'A' ? teamAName : teamBName;
    msg.innerText = `${callerName} calls it in the air`;
  }
  const decisionBox = document.getElementById('tossWinnerDecisionSection');
  if (decisionBox) decisionBox.hidden = true;
}

function flipCoinChoice(callChoice) {
  const coinImg = document.getElementById('coinImg');
  const flipButton = document.querySelector('.web-score-flip-button');
  const headsButton = document.getElementById('tossCallHeads');
  const tailsButton = document.getElementById('tossCallTails');
  const decisionBox = document.getElementById('tossWinnerDecisionSection');
  if (flipButton?.disabled) return;
  if (flipButton) {
    flipButton.disabled = true;
    flipButton.setAttribute('aria-busy', 'true');
  }
  const flipLabel = document.getElementById('webScoreFlipLabel');
  if (flipLabel) flipLabel.textContent = 'Flipping…';
  if (headsButton) headsButton.disabled = true;
  if (tailsButton) tailsButton.disabled = true;
  if (decisionBox) decisionBox.hidden = true;
  if (coinImg) {
    coinImg.classList.remove('spinning');
    void coinImg.offsetWidth;
    coinImg.classList.add('spinning');
  }

  const teamAName = document.getElementById('teamAName')?.value?.trim() || 'Team A';
  const teamBName = document.getElementById('teamBName')?.value?.trim() || 'Team B';

  setTimeout(() => {
    if (coinImg) coinImg.classList.remove('spinning');
    const isHeads = Math.random() < 0.5;
    const landedResult = isHeads ? 'HEADS' : 'TAILS';
    if (coinImg) {
      coinImg.src = isHeads ? 'img/coin_heads.png' : 'img/coin_tails.png';
      coinImg.alt = `Coin landed on ${landedResult.toLowerCase()}`;
    }
    if (flipButton) {
      flipButton.disabled = false;
      flipButton.setAttribute('aria-busy', 'false');
    }
    if (flipLabel) flipLabel.textContent = 'Flip Again';
    if (headsButton) headsButton.disabled = false;
    if (tailsButton) tailsButton.disabled = false;

    const callerName = tossCallerTeam === 'A' ? teamAName : teamBName;
    const nonCallerName = tossCallerTeam === 'A' ? teamBName : teamAName;

    const callerWon = callChoice === landedResult;
    const winnerName = callerWon ? callerName : nonCallerName;

    const decisionBox = document.getElementById('tossWinnerDecisionSection');
    const winnerHeading = document.getElementById('tossWinnerText');
    const winnerSub = document.getElementById('tossWinnerSubtext');

    if (winnerHeading) winnerHeading.innerText = `${winnerName.toUpperCase()} WON THE TOSS`;
    if (winnerSub) winnerSub.innerText = `It landed on ${landedResult.toLowerCase()}. What will they do?`;
    if (decisionBox) decisionBox.hidden = false;

    // Preserve team identity even if both teams use the same display name.
    const winnerIsA = callerWon ? tossCallerTeam === 'A' : tossCallerTeam !== 'A';
    selectedTossWinnerId = winnerIsA ? 'TEAM_A' : 'TEAM_B';
  }, 1200);
}

function setTossDecisionChoice(decision) {
  tossDecisionChoice = decision;
  const batBtn = document.getElementById('tossChoiceBat');
  const bowlBtn = document.getElementById('tossChoiceBowl');

  if (batBtn) batBtn.classList.toggle('active', decision === 'BAT');
  if (bowlBtn) bowlBtn.classList.toggle('active', decision === 'BOWL');
}

async function finishWizardAndStartMatch() {
  await handleCreateMatch({ openToss: false });

  // Trigger toss confirm
  selectedTossDecision = tossDecisionChoice;
  if (activeMatch) {
    const teamAName = document.getElementById('teamAName')?.value?.trim() || activeMatch.teamA.name;
    const teamBName = document.getElementById('teamBName')?.value?.trim() || activeMatch.teamB.name;
    activeMatch.teamA.name = teamAName;
    activeMatch.teamB.name = teamBName;

    activeMatch.scoringMode = currentScoringMode || 'QUICK';

    if (selectedTossWinnerId === 'TEAM_B') {
      activeMatch.tossWinnerId = activeMatch.teamB.id;
    } else {
      activeMatch.tossWinnerId = activeMatch.teamA.id;
    }

    activeMatch.tossDecision = selectedTossDecision;
    activeMatch.status = 'LIVE';

    // Set batting & bowling teams based on toss
    const tossWinnerIsA = activeMatch.tossWinnerId === activeMatch.teamA.id;
    const isBattingA = (tossWinnerIsA && selectedTossDecision === 'BAT') || (!tossWinnerIsA && selectedTossDecision === 'BOWL');
    const battingTeam = isBattingA ? activeMatch.teamA : activeMatch.teamB;
    const bowlingTeam = isBattingA ? activeMatch.teamB : activeMatch.teamA;

    activeMatch.battingTeamId = battingTeam.id;
    activeMatch.bowlingTeamId = bowlingTeam.id;

    // Auto-set striker, non-striker, and bowler if missing
    activeMatch.strikerId = battingTeam.players[0]?.id || null;
    activeMatch.nonStrikerId = battingTeam.players[1]?.id || null;
    activeMatch.currentBowlerId = bowlingTeam.players[0]?.id || null;

    activeMatch.pendingAction = 'NONE';
    activeMatch.updatedAt = new Date().toISOString();

    activeMatch = window.ScoringEngine.recalculateMatch(activeMatch);
    try {
      await window.CricStorage.saveMatch(activeMatch);
    } catch (err) {
      console.warn('Cloud saveMatch failed at wizard toss completion; proceeding with local backup.', err);
      if (window.CricStorage?.saveLocalMatchBackup) {
        window.CricStorage.saveLocalMatchBackup(activeMatch);
      }
      showToast('Saved locally. Cloud sync will retry when available.', 'info');
    }

    try {
      await markSeriesFixtureStartedIfNeeded(activeMatch.id);
    } catch (err) {
      console.warn('Unable to mark series fixture as started immediately.', err);
    }

    // Transition to SCORE (Step 4)
    updateWizardStepUI(3);
    showLiveScreen();
    showToast('🏏 Match Started! Live Scoring Active.', 'success');
  }
}

function openQuickTossModal() {
  closeFeaturesMenu();
  const modal = document.getElementById('standaloneCoinTossModal');
  const resultEl = document.getElementById('standaloneTossResult');
  const coinImg = document.getElementById('standaloneCoinImg');

  if (resultEl) resultEl.innerText = 'Flip the coin to start';
  if (coinImg) coinImg.src = 'img/coin_heads.png';
  if (modal) modal.classList.add('active');
}

function closeStandaloneCoinTossModal() {
  const modal = document.getElementById('standaloneCoinTossModal');
  if (modal) modal.classList.remove('active');
}

function spinStandaloneCoin() {
  const coinImg = document.getElementById('standaloneCoinImg');
  const resultEl = document.getElementById('standaloneTossResult');
  const flipBtn = document.getElementById('standaloneFlipBtn');

  if (coinImg) coinImg.classList.add('spinning');
  if (resultEl) resultEl.innerText = 'Flipping... 🪙';
  if (flipBtn) flipBtn.disabled = true;

  setTimeout(() => {
    if (coinImg) coinImg.classList.remove('spinning');
    if (flipBtn) flipBtn.disabled = false;

    const isHeads = Math.random() < 0.5;
    if (coinImg) coinImg.src = isHeads ? 'img/coin_heads.png' : 'img/coin_tails.png';
    if (resultEl) resultEl.innerText = isHeads ? 'Heads!' : 'Tails!';
  }, 800);
}

function resetStandaloneCoin() {
  const resultEl = document.getElementById('standaloneTossResult');
  const coinImg = document.getElementById('standaloneCoinImg');

  if (resultEl) resultEl.innerText = 'Flip the coin to start';
  if (coinImg) coinImg.src = 'img/coin_heads.png';
}
