// Storage Adapter - Optimistic Local-First with Background AWS Cloud Sync & Auth

window.CRIC_API_BASE = window.CRIC_API_BASE || "";

const CricStorage = {

  onToast: null, // Callback for Toast Notifications: (msg, type) => void

  notifyToast(msg, type = 'info') {
    if (typeof this.onToast === 'function') {
      this.onToast(msg, type);
    }
  },

  getAuthHeaders() {
    const token = localStorage.getItem('cric_auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  },

  unwrapListPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.items)) return payload.items;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.results)) return payload.results;
    return [];
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
          return data.user;
        }
      } catch (err) {
        console.warn('API register failed, registering locally:', err);
      }
    }

    const user = { userId: 'user_' + Date.now(), email, name: name || email.split('@')[0] };
    localStorage.setItem('cric_auth_token', 'token_local_' + Date.now());
    localStorage.setItem('cric_auth_user', JSON.stringify(user));
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

    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
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
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
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

    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      fetch(`${window.CRIC_API_BASE}/matches`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(match)
      }).then(res => {
        if (res.ok) {
          this.notifyToast('🟢 Match saved & synced to AWS Cloud', 'success');
        } else {
          this.notifyToast('🟡 Saved locally (API error)', 'warning');
        }
      }).catch(err => {
        this.notifyToast('🟡 Saved locally (Offline mode)', 'warning');
      });
    } else {
      this.notifyToast('💾 Saved locally', 'info');
    }

    return match;
  },

  async saveMatch(match) {
    match.updatedAt = new Date().toISOString();

    this.saveLocalMatchBackup(match);

    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      fetch(`${window.CRIC_API_BASE}/matches/${match.id}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(match)
      }).then(res => {
        if (res.ok) {
          this.notifyToast('🟢 Match updated on AWS Cloud', 'success');
        } else {
          this.notifyToast('🟡 Saved locally (API error)', 'warning');
        }
      }).catch(err => {
        this.notifyToast('🟡 Saved locally (Offline mode)', 'warning');
      });
    }

    return match;
  },

  async deleteMatch(matchId) {
    let cloudSuccess = true;

    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches/${matchId}`, { method: 'DELETE', headers: this.getAuthHeaders() });
        if (!res.ok) {
          cloudSuccess = false;
          console.warn(`API deleteMatch status ${res.status}`);
        }
      } catch (err) {
        cloudSuccess = false;
        console.warn('API deleteMatch failed:', err);
      }
    }

    const matches = await this.listMatches();
    const updated = matches.filter(m => m.id !== matchId);
    localStorage.setItem('cric_matches', JSON.stringify(updated));

    if (cloudSuccess) {
      this.notifyToast('🟢 Match deleted from Cloud', 'success');
    } else {
      this.notifyToast('🟡 Match deleted locally (Cloud sync failed or offline)', 'warning');
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
    if (!match || !Array.isArray(match.ballHistory)) return match;
    if (index < 0 || index >= match.ballHistory.length) return match;

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

    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
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

    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      fetch(`${window.CRIC_API_BASE}/tournaments`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(tournament)
      }).catch(console.warn);
    }

    const raw = localStorage.getItem('cric_tournaments');
    const tourneys = raw ? JSON.parse(raw) : [];
    const updated = [tournament, ...tourneys.filter(t => t.id !== tournament.id)];
    localStorage.setItem('cric_tournaments', JSON.stringify(updated));
    return tournament;
  },

  async deleteTournament(tournamentId) {
    let cloudSuccess = true;

    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/tournaments/${tournamentId}`, { method: 'DELETE', headers: this.getAuthHeaders() });
        if (!res.ok) {
          cloudSuccess = false;
          console.warn(`API deleteTournament status ${res.status}`);
        }
      } catch (err) {
        cloudSuccess = false;
        console.warn('API deleteTournament failed:', err);
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

    if (cloudSuccess) {
      this.notifyToast('🟢 Series and associated matches deleted from Cloud', 'success');
    } else {
      this.notifyToast('🟡 Series deleted locally (Cloud sync failed or offline)', 'warning');
    }

    return updatedTourneys;
  },

  // ------------------- GLOBAL PLAYERS -------------------
  async listGlobalPlayers() {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/players`, { headers: this.getAuthHeaders() });
        if (res.ok) {
          const remotePlayers = await res.json();
          if (Array.isArray(remotePlayers) && remotePlayers.length > 0) return remotePlayers;
        }
      } catch (err) {
        console.warn('API listGlobalPlayers failed, using local storage:', err);
      }
    }

    const raw = localStorage.getItem('cric_global_players');
    return raw ? JSON.parse(raw) : [];
  },

  async addGlobalPlayer(player) {
    player.id = player.id || 'gp_' + Date.now();

    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      fetch(`${window.CRIC_API_BASE}/players`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(player)
      }).catch(console.warn);
    }

    const raw = localStorage.getItem('cric_global_players');
    const players = raw ? JSON.parse(raw) : [];
    const updated = [player, ...players.filter(p => p.id !== player.id)];
    localStorage.setItem('cric_global_players', JSON.stringify(updated));
    return player;
  },

  async deleteGlobalPlayer(playerId) {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      fetch(`${window.CRIC_API_BASE}/players/${playerId}`, { method: 'DELETE', headers: this.getAuthHeaders() }).catch(console.warn);
    }

    const players = await this.listGlobalPlayers();
    const updated = players.filter(p => p.id !== playerId);
    localStorage.setItem('cric_global_players', JSON.stringify(updated));
    return updated;
  },

  async resetAllData() {
    localStorage.clear();
  }
};

window.CricStorage = CricStorage;
