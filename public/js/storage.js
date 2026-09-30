// Storage Adapter - Optimistic Local-First with background cloud sync & auth.

window.CRIC_API_BASE = window.CRIC_API_BASE || "";

const CricStorage = {

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

  unwrapListPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.items)) return payload.items;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.results)) return payload.results;
    return [];
  },

  // ------------------- BACKGROUND SYNC QUEUE -------------------
  queuePendingSync(method, endpoint, payload = null) {
    try {
      const raw = localStorage.getItem('cric_pending_sync');
      const queue = raw ? JSON.parse(raw) : [];
      queue.push({
        id: 'sync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        method,
        endpoint,
        payload,
        createdAt: new Date().toISOString()
      });
      localStorage.setItem('cric_pending_sync', JSON.stringify(queue));
    } catch (e) {
      console.warn('Failed to queue pending sync:', e);
    }
  },

  async processPendingSyncQueue() {
    if (this.isGuestUser() || !window.CRIC_API_BASE || !window.CRIC_API_BASE.trim()) return;

    const raw = localStorage.getItem('cric_pending_sync');
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

    localStorage.setItem('cric_pending_sync', JSON.stringify(remaining));
    if (syncedCount > 0) {
      this.notifyToast(`🟢 Synced ${syncedCount} pending change${syncedCount > 1 ? 's' : ''} to cloud`, 'success');
    }
  },

  // ------------------- AUTH -------------------
  async register(email, password, name) {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
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
      } catch (err) {
        console.warn('API register failed, registering locally:', err);
      }
    }

    const user = { userId: 'user_' + Date.now(), email, name: name || email.split('@')[0] };
    localStorage.setItem('cric_auth_token', 'token_local_' + Date.now());
    localStorage.setItem('cric_auth_user', JSON.stringify(user));
    localStorage.setItem('cric_user_mode', 'REGISTERED');
    return user;
  },

  async login(email, password) {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
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
      } catch (err) {
        console.warn('API login failed, logging in locally:', err);
      }
    }

    const user = { userId: 'user_local', email, name: email.split('@')[0] };
    localStorage.setItem('cric_auth_token', 'token_local');
    localStorage.setItem('cric_auth_user', JSON.stringify(user));
    return user;
  },

  logout() {
    localStorage.removeItem('cric_auth_token');
    localStorage.removeItem('cric_auth_user');
    localStorage.removeItem('cric_matches');
    localStorage.removeItem('cric_teams');
    localStorage.removeItem('cric_tournaments');
    localStorage.removeItem('cric_global_players');
    localStorage.removeItem('cric_active_match_id');
    localStorage.removeItem('cric_pending_sync');
  },

  getCurrentUser() {
    const raw = localStorage.getItem('cric_auth_user');
    return raw ? JSON.parse(raw) : null;
  },

  // ------------------- MATCHES -------------------
  async listMatches() {
    let localMatches = [];
    const raw = localStorage.getItem('cric_matches');
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
            localStorage.setItem('cric_matches', JSON.stringify(merged));
            return merged;
          }
        }
      } catch (err) {
        console.warn('API listMatches unreachable, using local storage:', err);
      }
    }

    return localMatches;
  },

  async getMatch(matchId) {
    const isSpectator = typeof isReadOnlySpectator !== 'undefined' && isReadOnlySpectator;
    if ((!this.isGuestUser() || isSpectator) && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches/${matchId}`, { headers: this.getAuthHeaders() });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('API getMatch unreachable, using local storage:', err);
      }
    }

    const matches = await this.listMatches();
    return matches.find(m => m.id === matchId) || null;
  },

  async createMatch(match) {
    if (!match.id) match.id = 'match_' + Date.now();
    match.updatedAt = new Date().toISOString();

    this.saveLocalMatchBackup(match);

    if (!this.isGuestUser() && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(match)
        });
        if (res.ok) {
          this.notifyToast('🟢 Match saved & synced', 'success');
        } else {
          this.notifyToast('💾 Saved locally (Cloud sync failed)', 'info');
          this.queuePendingSync('POST', '/matches', match);
        }
      } catch (err) {
        this.notifyToast('💾 Saved locally (Offline mode)', 'info');
        this.queuePendingSync('POST', '/matches', match);
      }
    } else {
      this.notifyToast('💾 Saved locally', 'info');
    }

    return match;
  },

  async saveMatch(match) {
    match.updatedAt = new Date().toISOString();

    this.saveLocalMatchBackup(match);

    if (!this.isGuestUser() && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches/${match.id}`, {
          method: 'PUT',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(match)
        });
        if (res.ok) {
          this.notifyToast('🟢 Match updated & synced', 'success');
        } else {
          this.notifyToast('💾 Saved locally (Cloud sync failed)', 'info');
          this.queuePendingSync('PUT', `/matches/${match.id}`, match);
        }
      } catch (err) {
        this.notifyToast('💾 Saved locally (Offline mode)', 'info');
        this.queuePendingSync('PUT', `/matches/${match.id}`, match);
      }
    }

    return match;
  },

  async deleteMatch(matchId) {
    let cloudSuccess = true;

    if (!this.isGuestUser() && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches/${matchId}`, { method: 'DELETE', headers: this.getAuthHeaders() });
        if (!res.ok) {
          cloudSuccess = false;
          console.warn(`API deleteMatch status ${res.status}`);
          this.queuePendingSync('DELETE', `/matches/${matchId}`);
        }
      } catch (err) {
        cloudSuccess = false;
        console.warn('API deleteMatch failed:', err);
        this.queuePendingSync('DELETE', `/matches/${matchId}`);
      }
    }

    const matches = await this.listMatches();
    const updated = matches.filter(m => m.id !== matchId);
    localStorage.setItem('cric_matches', JSON.stringify(updated));

    if (cloudSuccess && !this.isGuestUser()) {
      this.notifyToast('🟢 Match deleted from Cloud', 'success');
    } else {
      this.notifyToast('💾 Match deleted locally', 'info');
    }

    return updated;
  },

  saveLocalMatchBackup(match) {
    const raw = localStorage.getItem('cric_matches');
    const matches = raw ? JSON.parse(raw) : [];
    const updated = [match, ...matches.filter(m => m.id !== match.id)];
    localStorage.setItem('cric_matches', JSON.stringify(updated));
    localStorage.setItem('cric_active_match_id', match.id);
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
    const raw = localStorage.getItem('cric_teams');
    if (raw) {
      try { return JSON.parse(raw); } catch (e) { }
    }
    return [];
  },

  async saveTeam(team) {
    if (!team.id) team.id = 'team_' + Date.now();
    const teams = await this.listTeams();
    const updated = [team, ...teams.filter(t => t.id !== team.id)];
    localStorage.setItem('cric_teams', JSON.stringify(updated));
    return team;
  },

  async deleteTeam(teamId) {
    const teams = await this.listTeams();
    const updated = teams.filter(t => t.id !== teamId);
    localStorage.setItem('cric_teams', JSON.stringify(updated));
    return updated;
  },

  // ------------------- TOURNAMENTS / SERIES -------------------
  async listTournaments() {
    let localTourneys = [];
    const raw = localStorage.getItem('cric_tournaments');
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
            localStorage.setItem('cric_tournaments', JSON.stringify(merged));
            return merged;
          }
        }
      } catch (err) {
        console.warn('API listTournaments unreachable, using local storage:', err);
      }
    }

    return localTourneys;
  },

  async saveTournament(tournament) {
    if (!tournament.id) tournament.id = 'tourney_' + Date.now();
    tournament.updatedAt = new Date().toISOString();

    // 1. Write locally first
    const raw = localStorage.getItem('cric_tournaments');
    const tourneys = raw ? JSON.parse(raw) : [];
    const updated = [tournament, ...tourneys.filter(t => t.id !== tournament.id)];
    localStorage.setItem('cric_tournaments', JSON.stringify(updated));

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
    localStorage.setItem('cric_tournaments', JSON.stringify(updatedTourneys));

    const rawMatches = localStorage.getItem('cric_matches');
    if (rawMatches) {
      const matches = JSON.parse(rawMatches);
      const updatedMatches = matches.filter(m => m.tournamentId !== tournamentId);
      localStorage.setItem('cric_matches', JSON.stringify(updatedMatches));
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
    const raw = localStorage.getItem('cric_global_players');
    if (raw) {
      try { localPlayers = JSON.parse(raw); } catch (e) { localPlayers = []; }
    }

    if (!this.isGuestUser() && window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/players`, { headers: this.getAuthHeaders() });
        if (res.ok) {
          const remotePayload = await res.json();
          const remotePlayers = this.unwrapListPayload(remotePayload);
          if (Array.isArray(remotePlayers)) {
            const playerMap = new Map();
            localPlayers.forEach(p => playerMap.set(p.id, p));

            remotePlayers.forEach(rp => {
              const lp = playerMap.get(rp.id);
              if (!lp || (rp.updatedAt && new Date(rp.updatedAt) > new Date(lp.updatedAt || 0))) {
                playerMap.set(rp.id, rp);
              }
            });

            const merged = Array.from(playerMap.values());
            localStorage.setItem('cric_global_players', JSON.stringify(merged));
            return merged;
          }
        }
      } catch (err) {
        console.warn('API listGlobalPlayers failed, using local storage:', err);
      }
    }

    return localPlayers;
  },

  async addGlobalPlayer(player) {
    if (!player.id) player.id = 'gp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    player.updatedAt = new Date().toISOString();

    // 1. Write locally first
    const raw = localStorage.getItem('cric_global_players');
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
    localStorage.setItem('cric_global_players', JSON.stringify(updated));

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

    const raw = localStorage.getItem('cric_global_players');
    const players = raw ? JSON.parse(raw) : [];
    const updated = players.filter(p => p.id !== playerId);
    localStorage.setItem('cric_global_players', JSON.stringify(updated));

    if (cloudSuccess && !this.isGuestUser()) {
      this.notifyToast('🟢 Player deleted from Cloud', 'success');
    } else {
      this.notifyToast('💾 Player deleted locally', 'info');
    }

    return updated;
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
