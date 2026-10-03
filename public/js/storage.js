// Storage Adapter - Optimistic Local-First with background cloud sync & auth.

window.CRIC_API_BASE = window.CRIC_API_BASE || "";

const CricStorage = {

  scopedDataKeys: new Set([
    'cric_matches',
    'cric_teams',
    'cric_tournaments',
    'cric_global_players',
    'cric_active_match_id',
    'cric_pending_sync'
  ]),

  onToast: null, // Callback for Toast Notifications: (msg, type) => void

  notifyToast(msg, type = 'info') {
    if (typeof this.onToast === 'function') {
      this.onToast(msg, type);
    }
  },

  isGuestUser() {
    const userMode = localStorage.getItem('cric_user_mode');
    const token = localStorage.getItem('cric_auth_token');
    return userMode === 'GUEST' || !token || token.startsWith('token_local');
  },

  getAuthHeaders() {
    const token = localStorage.getItem('cric_auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token && !token.startsWith('token_local')) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  },

  getStorageScopeId() {
    const user = this.getAuthUser();
    const userId = String(user?.userId || '').trim();
    const email = String(user?.email || '').trim().toLowerCase();
    const identity = userId || email;
    if (!identity) return 'anon';
    return identity.replace(/[^a-z0-9@._-]/gi, '_');
  },

  getScopedDataKey(baseKey, scopeId = this.getStorageScopeId()) {
    if (!this.scopedDataKeys.has(baseKey)) return baseKey;
    return `${baseKey}::${scopeId}`;
  },

  readScopedDataValue(baseKey) {
    if (!this.scopedDataKeys.has(baseKey)) {
      return localStorage.getItem(baseKey);
    }

    const scopeId = this.getStorageScopeId();
    const scopedKey = this.getScopedDataKey(baseKey, scopeId);
    const scopedValue = localStorage.getItem(scopedKey);
    if (scopedValue !== null) return scopedValue;

    // Safe migration path for legacy unauthenticated data only.
    if (scopeId !== 'anon') return null;

    const legacyValue = localStorage.getItem(baseKey);
    if (legacyValue !== null) {
      localStorage.setItem(scopedKey, legacyValue);
      localStorage.removeItem(baseKey);
    }
    return legacyValue;
  },

  writeScopedDataValue(baseKey, value) {
    localStorage.setItem(this.getScopedDataKey(baseKey), value);
  },

  removeScopedDataValue(baseKey) {
    localStorage.removeItem(this.getScopedDataKey(baseKey));
  },

  getLocalMatchesSnapshot() {
    const raw = this.readScopedDataValue('cric_matches');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  },

  getActiveMatchId() {
    return this.readScopedDataValue('cric_active_match_id');
  },

  unwrapListPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.items)) return payload.items;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.results)) return payload.results;
    return [];
  },

  hasCloudApi() {
    return Boolean(window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0);
  },

  getLocalMatchById(matchId) {
    const matches = this.getLocalMatchesSnapshot();
    return matches.find(m => m?.id === matchId) || null;
  },

  isStrictCloudMode() {
    return !this.isGuestUser() && this.hasCloudApi();
  },

  throwWebReadOnlyError() {
    throw new Error('Web scoring is read-only. Use Android app to create or update match scoring, then refresh web view.');
  },

  // ------------------- BACKGROUND SYNC QUEUE -------------------
  queuePendingSync(method, endpoint, payload = null) {
    try {
      const raw = this.readScopedDataValue('cric_pending_sync');
      const queue = raw ? JSON.parse(raw) : [];
      queue.push({
        id: 'sync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        method,
        endpoint,
        payload,
        createdAt: new Date().toISOString()
      });
      this.writeScopedDataValue('cric_pending_sync', JSON.stringify(queue));
    } catch (e) {
      console.warn('Failed to queue pending sync:', e);
    }
  },

  async processPendingSyncQueue() {
    if (this.isGuestUser() || !window.CRIC_API_BASE || !window.CRIC_API_BASE.trim()) return;

    const raw = this.readScopedDataValue('cric_pending_sync');
    if (!raw) return;

    let queue = [];
    try { queue = JSON.parse(raw); } catch (e) { queue = []; }
    if (!queue.length) return;

    const remaining = [];
    let syncedCount = 0;

    for (const item of queue) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}${item.endpoint}`, {
          method: item.method,
          headers: this.getAuthHeaders(),
          body: item.payload ? JSON.stringify(item.payload) : undefined
        });
        if (res.ok) {
          syncedCount++;
        } else if ([401, 409, 429].includes(res.status)) {
          remaining.push(item);
        } else if (res.status >= 400 && res.status < 500) {
          // Client request error - discard unprocessable payload
          console.warn(`Pending sync discarded (HTTP ${res.status}):`, item);
        } else {
          remaining.push(item);
        }
      } catch (err) {
        // Still offline or network error
        remaining.push(item);
      }
    }

    this.writeScopedDataValue('cric_pending_sync', JSON.stringify(remaining));
    if (syncedCount > 0) {
      this.notifyToast(`🟢 Synced ${syncedCount} pending change${syncedCount > 1 ? 's' : ''} to cloud`, 'success');
    }
  },

  // ------------------- AUTH -------------------
  getAuthUser() {
    const raw = localStorage.getItem('cric_auth_user');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  },

  getAuthEmail() {
    const user = this.getAuthUser();
    return user ? (user.email || '').trim().toLowerCase() : '';
  },

  async register(email, password, name) {
    if (!this.hasCloudApi()) {
      throw new Error('Cloud sign-up is unavailable right now. Guest mode is available for WebScore.');
    }

    if (this.hasCloudApi()) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name })
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('cric_auth_token', data.token);
          localStorage.setItem('cric_auth_user', JSON.stringify(data.user));
          localStorage.setItem('cric_user_mode', 'REGISTERED');
          this.processPendingSyncQueue();
          return data.user;
        }
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Registration failed (HTTP ${res.status})`);
      } catch (err) {
        console.warn('API register failed:', err);
        const msg = String(err?.message || '');
        if (msg) {
          throw err;
        }
        throw new Error('Unable to register to cloud right now. Please try again.');
      }
    }
  },

  async login(email, password) {
    if (!this.hasCloudApi()) {
      throw new Error('Cloud sign-in is unavailable right now. Guest mode is available for WebScore.');
    }

    if (this.hasCloudApi()) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('cric_auth_token', data.token);
          localStorage.setItem('cric_auth_user', JSON.stringify(data.user));
          localStorage.setItem('cric_user_mode', 'REGISTERED');
          this.processPendingSyncQueue();
          return data.user;
        }
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Login failed (HTTP ${res.status})`);
      } catch (err) {
        console.warn('API login failed:', err);
        const msg = String(err?.message || '');
        if (msg) {
          throw err;
        }
        throw new Error('Unable to sign in to cloud right now. Please try again.');
      }
    }
  },

  logout() {
    localStorage.removeItem('cric_auth_token');
    localStorage.removeItem('cric_auth_user');
    localStorage.removeItem('cric_user_mode');
    this.removeScopedDataValue('cric_active_match_id');
    this.removeScopedDataValue('cric_pending_sync');
  },

  getCurrentUser() {
    const raw = localStorage.getItem('cric_auth_user');
    return raw ? JSON.parse(raw) : null;
  },

  // ------------------- MATCHES -------------------
  async listMatches() {
    let localMatches = [];
    const raw = this.readScopedDataValue('cric_matches');
    if (raw) {
      try { localMatches = JSON.parse(raw); } catch (e) { localMatches = []; }
    }

    if (!this.isGuestUser() && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches`, { headers: this.getAuthHeaders() });
        if (res.ok) {
          const remoteMatches = this.unwrapListPayload(await res.json());
          if (Array.isArray(remoteMatches)) {
            const matchMap = new Map();
            localMatches.forEach(m => matchMap.set(m.id, m));

            remoteMatches.forEach(rm => {
              const lm = matchMap.get(rm.id);
              if (!lm || (rm.updatedAt && new Date(rm.updatedAt) > new Date(lm.updatedAt || 0))) {
                matchMap.set(rm.id, rm);
              }
            });

            const merged = Array.from(matchMap.values());
            this.writeScopedDataValue('cric_matches', JSON.stringify(merged));
            return merged;
          }
        }
        if (this.isStrictCloudMode()) {
          throw new Error(`Unable to load matches from cloud (HTTP ${res.status})`);
        }
      } catch (err) {
        if (this.isStrictCloudMode()) {
          throw err;
        }
        console.warn('API listMatches unreachable, using local storage:', err);
      }
    }

    return localMatches;
  },

  async getMatch(matchId) {
    const isSpectator = typeof isReadOnlySpectator !== 'undefined' && isReadOnlySpectator;
    if ((!this.isGuestUser() || isSpectator) && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const params = new URLSearchParams(window.location.search);
        const spectatorToken = isSpectator ? params.get('st') : null;
        const url = spectatorToken
          ? `${window.CRIC_API_BASE}/matches/${matchId}?st=${encodeURIComponent(spectatorToken)}`
          : `${window.CRIC_API_BASE}/matches/${matchId}`;
        const headers = spectatorToken ? { 'Content-Type': 'application/json' } : this.getAuthHeaders();
        const res = await fetch(url, { headers });
        if (res.ok) {
          const match = await res.json();
          if (!isSpectator) match.cloudReadOnly = true;
          return match;
        }
        if (!isSpectator && (res.status === 403 || res.status === 404)) {
          const localFallback = this.getLocalMatchById(matchId);
          if (localFallback?.localOnly) {
            this.notifyToast('Opened local-only match. Cloud matches are read-only on Web.', 'info');
            return localFallback;
          }
        }
        if (this.isStrictCloudMode() || isSpectator) {
          throw new Error(`Unable to load match from cloud (HTTP ${res.status})`);
        }
      } catch (err) {
        if (!isSpectator && this.isStrictCloudMode()) {
          const localFallback = this.getLocalMatchById(matchId);
          if (localFallback?.localOnly) {
            this.notifyToast('Opened local-only match. Cloud matches are read-only on Web.', 'info');
            return localFallback;
          }
        }
        if (this.isStrictCloudMode() || isSpectator) {
          throw err;
        }
        console.warn('API getMatch unreachable, using local storage:', err);
      }
    }

    const matches = await this.listMatches();
    return matches.find(m => m.id === matchId) || null;
  },

  async createMatch(match) {
    if (!match.id) match.id = 'match_' + Date.now();
    match.updatedAt = new Date().toISOString();
    match.localOnly = true;
    this.saveLocalMatchBackup(match);

    if (this.isStrictCloudMode()) {
      this.notifyToast('💾 Match saved locally. Web does not write match scoring to cloud.', 'info');
      return match;
    }
    this.notifyToast('💾 Saved locally', 'info');
    return match;
  },

  async createSpectatorShareToken(matchId, ttlMinutes) {
    if (this.isGuestUser() || !this.hasCloudApi()) {
      throw new Error('Live sharing requires signed-in cloud mode');
    }

    const payload = {};
    if (Number.isFinite(Number(ttlMinutes)) && Number(ttlMinutes) > 0) {
      payload.ttlMinutes = Number(ttlMinutes);
    }

    let res = await fetch(`${window.CRIC_API_BASE}/matches/${matchId}/share-token`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) {
        throw new Error('Match is not available in cloud for your account. Sync from Android app first.');
      }
      throw new Error(body.error || `Unable to create share token (HTTP ${res.status})`);
    }
    return body;
  },

  async revokeSpectatorShareToken(matchId) {
    if (this.isGuestUser() || !this.hasCloudApi()) {
      throw new Error('Share revocation requires signed-in cloud mode');
    }

    const res = await fetch(`${window.CRIC_API_BASE}/matches/${matchId}/revoke-share`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `Unable to revoke share links (HTTP ${res.status})`);
    }
    return body;
  },

  async saveMatch(match) {
    if (this.isStrictCloudMode() && !match.localOnly) {
      this.throwWebReadOnlyError();
    }

    match.updatedAt = new Date().toISOString();
    if (match.localOnly) {
      this.saveLocalMatchBackup(match);
      this.notifyToast('💾 Local-only match saved in this browser.', 'info');
      return match;
    }

    if (this.isStrictCloudMode()) {
      this.throwWebReadOnlyError();
    }

    this.saveLocalMatchBackup(match);
    this.notifyToast('💾 Saved locally', 'info');
    return match;
  },

  async deleteMatch(matchId) {
    const localMatch = this.getLocalMatchById(matchId);
    if (this.isStrictCloudMode() && !localMatch?.localOnly) {
      this.throwWebReadOnlyError();
    }

    if (localMatch?.localOnly) {
      const matches = this.getLocalMatchesSnapshot().filter(match => match.id !== matchId);
      this.writeScopedDataValue('cric_matches', JSON.stringify(matches));
      if (this.getActiveMatchId() === matchId) this.removeScopedDataValue('cric_active_match_id');
      this.notifyToast('💾 Local-only match deleted from this browser.', 'info');
      return matches;
    }

    const matches = await this.listMatches();
    const updated = matches.filter(m => m.id !== matchId);
    this.writeScopedDataValue('cric_matches', JSON.stringify(updated));

    this.notifyToast('💾 Match deleted locally', 'info');

    return updated;
  },

  saveLocalMatchBackup(match) {
    const raw = this.readScopedDataValue('cric_matches');
    const matches = raw ? JSON.parse(raw) : [];
    const updated = [match, ...matches.filter(m => m.id !== match.id)];
    this.writeScopedDataValue('cric_matches', JSON.stringify(updated));
    this.writeScopedDataValue('cric_active_match_id', match.id);
    return match;
  },

  async addBall(matchId, ball) {
    const match = await this.getMatch(matchId);
    if (!match) return null;

    match.ballHistory = [...(match.ballHistory || []), ball];
    const recalculated = window.ScoringEngine.recalculateMatch(match);
    return await this.saveMatch(recalculated);
  },

  async undoBall(matchId) {
    const match = await this.getMatch(matchId);
    if (!match || !match.ballHistory || match.ballHistory.length === 0) return match;

    match.ballHistory.pop();
    const recalculated = window.ScoringEngine.recalculateMatch(match);
    return await this.saveMatch(recalculated);
  },

  async updateBall(matchId, index, updatedBall) {
    const match = await this.getMatch(matchId);
    if (!match || !Array.isArray(match.ballHistory) || index < 0 || index >= match.ballHistory.length) return match;

    const newHistory = [...match.ballHistory];
    newHistory[index] = updatedBall;
    match.ballHistory = newHistory;

    const recalculated = window.ScoringEngine.recalculateMatch(match);
    return await this.saveMatch(recalculated);
  },

  // ------------------- TEAMS LAYER -------------------
  async listTeams() {
    const raw = this.readScopedDataValue('cric_teams');
    if (raw) {
      try { return JSON.parse(raw); } catch (e) { }
    }
    return [];
  },

  async saveTeam(team) {
    if (!team.id) team.id = 'team_' + Date.now();
    const teams = await this.listTeams();
    const incomingNameKey = `${team?.name || ''}`.trim().toLowerCase();
    const existingByName = incomingNameKey
      ? teams.find(t => `${t?.name || ''}`.trim().toLowerCase() === incomingNameKey)
      : null;

    if (existingByName && existingByName.id !== team.id) {
      team.id = existingByName.id;
    }

    const updated = [
      team,
      ...teams.filter(t => {
        const existingNameKey = `${t?.name || ''}`.trim().toLowerCase();
        if (t.id === team.id) return false;
        if (incomingNameKey && existingNameKey === incomingNameKey) return false;
        return true;
      })
    ];
    this.writeScopedDataValue('cric_teams', JSON.stringify(updated));
    return team;
  },

  async deleteTeam(teamId) {
    const teams = await this.listTeams();
    const updated = teams.filter(t => t.id !== teamId);
    this.writeScopedDataValue('cric_teams', JSON.stringify(updated));
    return updated;
  },

  // ------------------- TOURNAMENTS / SERIES -------------------
  async listTournaments() {
    let localTourneys = [];
    const raw = this.readScopedDataValue('cric_tournaments');
    if (raw) {
      try { localTourneys = JSON.parse(raw); } catch (e) { localTourneys = []; }
    }

    if (!this.isGuestUser() && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/tournaments`, { headers: this.getAuthHeaders() });
        if (res.ok) {
          const remoteTourneys = this.unwrapListPayload(await res.json());
          if (Array.isArray(remoteTourneys)) {
            const tourneyMap = new Map();
            localTourneys.forEach(t => tourneyMap.set(t.id, t));

            remoteTourneys.forEach(rt => {
              const lt = tourneyMap.get(rt.id);
              if (!lt || (rt.updatedAt && new Date(rt.updatedAt) > new Date(lt.updatedAt || 0))) {
                tourneyMap.set(rt.id, rt);
              }
            });

            const merged = Array.from(tourneyMap.values());
            this.writeScopedDataValue('cric_tournaments', JSON.stringify(merged));
            return merged;
          }
        }
        if (this.isStrictCloudMode()) {
          throw new Error(`Unable to load tournaments from cloud (HTTP ${res.status})`);
        }
      } catch (err) {
        if (this.isStrictCloudMode()) {
          throw err;
        }
        console.warn('API listTournaments unreachable, using local storage:', err);
      }
    }

    return localTourneys;
  },

  async saveTournament(tournament) {
    if (!tournament.id) tournament.id = 'tourney_' + Date.now();
    tournament.updatedAt = new Date().toISOString();

    if (this.isStrictCloudMode()) {
      const res = await fetch(`${window.CRIC_API_BASE}/tournaments`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(tournament)
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Unable to save series to cloud (HTTP ${res.status})`);
      }

      const rawStrict = this.readScopedDataValue('cric_tournaments');
      const strictList = rawStrict ? JSON.parse(rawStrict) : [];
      const strictUpdated = [tournament, ...strictList.filter(t => t.id !== tournament.id)];
      this.writeScopedDataValue('cric_tournaments', JSON.stringify(strictUpdated));
      this.notifyToast('🟢 Series saved & synced', 'success');
      return tournament;
    }

    // 1. Write locally first
    const raw = this.readScopedDataValue('cric_tournaments');
    const tourneys = raw ? JSON.parse(raw) : [];
    const updated = [tournament, ...tourneys.filter(t => t.id !== tournament.id)];
    this.writeScopedDataValue('cric_tournaments', JSON.stringify(updated));

    // 2. Cloud sync
    if (!this.isGuestUser() && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/tournaments`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(tournament)
        });
        if (res.ok) {
          this.notifyToast('🟢 Series saved & synced', 'success');
        } else {
          this.notifyToast('💾 Series saved locally (Cloud sync failed)', 'info');
          this.queuePendingSync('POST', '/tournaments', tournament);
        }
      } catch (err) {
        console.warn('API saveTournament failed:', err);
        this.notifyToast('💾 Series saved locally (Offline)', 'info');
        this.queuePendingSync('POST', '/tournaments', tournament);
      }
    } else {
      this.notifyToast('💾 Series saved locally', 'info');
    }

    return tournament;
  },

  async deleteTournament(tournamentId) {
    if (this.isStrictCloudMode()) {
      const res = await fetch(`${window.CRIC_API_BASE}/tournaments/${tournamentId}`, { method: 'DELETE', headers: this.getAuthHeaders() });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Unable to delete series from cloud (HTTP ${res.status})`);
      }

      const tourneysStrict = await this.listTournaments();
      const updatedTourneysStrict = tourneysStrict.filter(t => t.id !== tournamentId);
      this.writeScopedDataValue('cric_tournaments', JSON.stringify(updatedTourneysStrict));

      const rawMatchesStrict = this.readScopedDataValue('cric_matches');
      if (rawMatchesStrict) {
        const matchesStrict = JSON.parse(rawMatchesStrict);
        const updatedMatchesStrict = matchesStrict.filter(m => m.tournamentId !== tournamentId);
        this.writeScopedDataValue('cric_matches', JSON.stringify(updatedMatchesStrict));
      }

      this.notifyToast('🟢 Series and associated matches deleted from Cloud', 'success');
      return updatedTourneysStrict;
    }

    let cloudSuccess = true;

    if (!this.isGuestUser() && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/tournaments/${tournamentId}`, { method: 'DELETE', headers: this.getAuthHeaders() });
        if (!res.ok) {
          cloudSuccess = false;
          console.warn(`API deleteTournament status ${res.status}`);
          this.queuePendingSync('DELETE', `/tournaments/${tournamentId}`);
        }
      } catch (err) {
        cloudSuccess = false;
        console.warn('API deleteTournament failed:', err);
        this.queuePendingSync('DELETE', `/tournaments/${tournamentId}`);
      }
    }

    // Always perform local cascade cleanup
    const tourneys = await this.listTournaments();
    const updatedTourneys = tourneys.filter(t => t.id !== tournamentId);
    this.writeScopedDataValue('cric_tournaments', JSON.stringify(updatedTourneys));

    const rawMatches = this.readScopedDataValue('cric_matches');
    if (rawMatches) {
      const matches = JSON.parse(rawMatches);
      const updatedMatches = matches.filter(m => m.tournamentId !== tournamentId);
      this.writeScopedDataValue('cric_matches', JSON.stringify(updatedMatches));
    }

    if (cloudSuccess && !this.isGuestUser()) {
      this.notifyToast('🟢 Series and associated matches deleted from Cloud', 'success');
    } else {
      this.notifyToast('💾 Series deleted locally', 'info');
    }

    return updatedTourneys;
  },

  // ------------------- GLOBAL PLAYERS -------------------
  async listGlobalPlayers() {
    let localPlayers = [];
    const raw = this.readScopedDataValue('cric_global_players');
    if (raw) {
      try { localPlayers = JSON.parse(raw); } catch (e) { localPlayers = []; }
    }

    if (!this.isGuestUser() && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/players`, { headers: this.getAuthHeaders() });
        if (res.ok) {
          const remotePayload = await res.json();
          let remotePlayers = this.unwrapListPayload(remotePayload);
          if (Array.isArray(remotePlayers)) {
            remotePlayers = remotePlayers.map(rp => {
              const item = rp.payload || rp;
              const pId = item.id || rp.id || rp.playerId;
              return { ...item, id: pId };
            });

            const playerMap = new Map();
            localPlayers.forEach(p => {
              if (!p) return;
              const item = p.payload || p;
              const pId = item.id || p.id || p.playerId;
              if (pId) playerMap.set(pId, { ...item, id: pId });
            });

            remotePlayers.forEach(rp => {
              if (!rp || !rp.id) return;
              const lp = playerMap.get(rp.id);
              if (!lp || (rp.updatedAt && new Date(rp.updatedAt) > new Date(lp.updatedAt || 0))) {
                playerMap.set(rp.id, rp);
              }
            });

            const merged = Array.from(playerMap.values());
            this.writeScopedDataValue('cric_global_players', JSON.stringify(merged));
            return merged;
          }
        }
        if (this.isStrictCloudMode()) {
          throw new Error(`Unable to load players from cloud (HTTP ${res.status})`);
        }
      } catch (err) {
        if (this.isStrictCloudMode()) {
          throw err;
        }
        console.warn('API listGlobalPlayers failed, using local storage:', err);
      }
    }

    return localPlayers;
  },

  async addGlobalPlayer(player) {
    if (!player.id) player.id = 'gp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    player.updatedAt = new Date().toISOString();

    if (this.isStrictCloudMode()) {
      const res = await fetch(`${window.CRIC_API_BASE}/players`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(player)
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Unable to save player to cloud (HTTP ${res.status})`);
      }

      const rawStrict = this.readScopedDataValue('cric_global_players');
      const strictPlayers = rawStrict ? JSON.parse(rawStrict) : [];
      const incomingNameKeyStrict = `${player?.name || ''}`.trim().toLowerCase();
      const updatedStrict = [
        player,
        ...strictPlayers.filter(p => {
          const existingNameKey = `${p?.name || ''}`.trim().toLowerCase();
          if (p.id === player.id) return false;
          if (incomingNameKeyStrict && existingNameKey === incomingNameKeyStrict) return false;
          return true;
        })
      ];
      this.writeScopedDataValue('cric_global_players', JSON.stringify(updatedStrict));
      this.notifyToast('🟢 Player saved & synced', 'success');
      return player;
    }

    // 1. Write locally first
    const raw = this.readScopedDataValue('cric_global_players');
    const players = raw ? JSON.parse(raw) : [];
    const incomingNameKey = `${player?.name || ''}`.trim().toLowerCase();
    const updated = [
      player,
      ...players.filter(p => {
        const existingNameKey = `${p?.name || ''}`.trim().toLowerCase();
        if (p.id === player.id) return false;
        if (incomingNameKey && existingNameKey === incomingNameKey) return false;
        return true;
      })
    ];
    this.writeScopedDataValue('cric_global_players', JSON.stringify(updated));

    // 2. Cloud sync
    if (!this.isGuestUser() && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/players`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(player)
        });
        if (res.ok) {
          this.notifyToast('🟢 Player saved & synced', 'success');
        } else {
          this.notifyToast('💾 Player saved locally (Cloud sync failed)', 'info');
          this.queuePendingSync('POST', '/players', player);
        }
      } catch (err) {
        console.warn('API addGlobalPlayer failed:', err);
        this.notifyToast('💾 Player saved locally (Offline)', 'info');
        this.queuePendingSync('POST', '/players', player);
      }
    } else {
      this.notifyToast('💾 Player saved locally', 'info');
    }

    return player;
  },

  async deleteGlobalPlayer(playerId) {
    if (this.isStrictCloudMode()) {
      const res = await fetch(`${window.CRIC_API_BASE}/players/${playerId}`, { method: 'DELETE', headers: this.getAuthHeaders() });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Unable to delete player from cloud (HTTP ${res.status})`);
      }

      const rawStrict = this.readScopedDataValue('cric_global_players');
      const playersStrict = rawStrict ? JSON.parse(rawStrict) : [];
      const updatedStrict = playersStrict.filter(p => p.id !== playerId);
      this.writeScopedDataValue('cric_global_players', JSON.stringify(updatedStrict));
      this.notifyToast('🟢 Player deleted from Cloud', 'success');
      return updatedStrict;
    }

    let cloudSuccess = true;

    if (!this.isGuestUser() && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/players/${playerId}`, { method: 'DELETE', headers: this.getAuthHeaders() });
        if (!res.ok) {
          cloudSuccess = false;
          console.warn(`API deleteGlobalPlayer status ${res.status}`);
          this.queuePendingSync('DELETE', `/players/${playerId}`);
        }
      } catch (err) {
        cloudSuccess = false;
        console.warn('API deleteGlobalPlayer failed:', err);
        this.queuePendingSync('DELETE', `/players/${playerId}`);
      }
    }

    const raw = this.readScopedDataValue('cric_global_players');
    const players = raw ? JSON.parse(raw) : [];
    const updated = players.filter(p => p.id !== playerId);
    this.writeScopedDataValue('cric_global_players', JSON.stringify(updated));

    if (cloudSuccess && !this.isGuestUser()) {
      this.notifyToast('🟢 Player deleted from Cloud', 'success');
    } else {
      this.notifyToast('💾 Player deleted locally', 'info');
    }

    return updated;
  },

  // ------------------- ADMIN CONSOLE API -------------------
  async fetchAdminUsers() {
    if (!window.CRIC_API_BASE) throw new Error('Cloud API base URL not configured');
    const res = await fetch(`${window.CRIC_API_BASE}/admin/users`, { headers: this.getAuthHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch users (HTTP ${res.status})`);
    }
    return await res.json();
  },

  async fetchAdminSystemHealth() {
    if (!window.CRIC_API_BASE) throw new Error('Cloud API base URL not configured');
    const res = await fetch(`${window.CRIC_API_BASE}/admin/system-health`, { headers: this.getAuthHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch system health (HTTP ${res.status})`);
    }
    return await res.json();
  },

  async fetchAdminAuthSyncMetrics() {
    if (!window.CRIC_API_BASE) throw new Error('Cloud API base URL not configured');
    const res = await fetch(`${window.CRIC_API_BASE}/admin/auth-sync`, { headers: this.getAuthHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch auth sync metrics (HTTP ${res.status})`);
    }
    return await res.json();
  },

  async fetchAdminErrorDashboard() {
    if (!window.CRIC_API_BASE) throw new Error('Cloud API base URL not configured');
    const res = await fetch(`${window.CRIC_API_BASE}/admin/error-dashboard`, { headers: this.getAuthHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch error dashboard (HTTP ${res.status})`);
    }
    return await res.json();
  },

  async fetchAdminAuditLogs() {
    if (!window.CRIC_API_BASE) throw new Error('Cloud API base URL not configured');
    const res = await fetch(`${window.CRIC_API_BASE}/admin/audit-logs`, { headers: this.getAuthHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch audit logs (HTTP ${res.status})`);
    }
    return await res.json();
  },

  async reportFrontendError(errorDetail) {
    if (!window.CRIC_API_BASE) return;
    try {
      await fetch(`${window.CRIC_API_BASE}/admin/error-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'FRONTEND',
          error: String(errorDetail?.message || errorDetail || 'Frontend Exception'),
          path: window.location.pathname,
          statusCode: 500
        })
      });
    } catch (_) {
      // Ignore background error reporting failures
    }
  },

  async resetAllData() {
    localStorage.clear();
  }
};

window.addEventListener('online', () => {
  if (window.CricStorage && typeof window.CricStorage.processPendingSyncQueue === 'function') {
    window.CricStorage.processPendingSyncQueue();
  }
});

// Attempt processing queue on load
if (typeof window !== 'undefined') {
  setTimeout(() => {
    if (window.CricStorage && typeof window.CricStorage.processPendingSyncQueue === 'function') {
      window.CricStorage.processPendingSyncQueue();
    }
  }, 1000);
}

window.CricStorage = CricStorage;
