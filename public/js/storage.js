// Storage Adapter supporting window.CRIC_API_BASE switch

window.CRIC_API_BASE = window.CRIC_API_BASE || "";

const CricStorage = {

  // ------------------- MATCHES -------------------
  async listMatches() {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches`);
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch (err) {
        console.warn('API fetch failed, falling back to localStorage:', err);
      }
    }

    const raw = localStorage.getItem('cric_matches');
    return raw ? JSON.parse(raw) : [];
  },

  async getMatch(matchId) {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches/${matchId}`);
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return await res.json();
      } catch (err) {
        console.warn('API getMatch failed, falling back to localStorage:', err);
      }
    }

    const matches = await this.listMatches();
    return matches.find(m => m.id === matchId) || null;
  },

  async createMatch(match) {
    if (!match.id) {
      match.id = 'match_' + Date.now();
    }
    match.updatedAt = new Date().toISOString();

    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(match)
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const saved = await res.json();
        this.saveLocalMatchBackup(saved);
        return saved;
      } catch (err) {
        console.warn('API createMatch failed, saving to localStorage:', err);
      }
    }

    return this.saveLocalMatchBackup(match);
  },

  async saveMatch(match) {
    match.updatedAt = new Date().toISOString();

    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches/${match.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(match)
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const saved = await res.json();
        this.saveLocalMatchBackup(saved);
        return saved;
      } catch (err) {
        console.warn('API saveMatch failed, updating localStorage:', err);
      }
    }

    return this.saveLocalMatchBackup(match);
  },

  async deleteMatch(matchId) {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        await fetch(`${window.CRIC_API_BASE}/matches/${matchId}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('API deleteMatch failed:', err);
      }
    }

    const matches = await this.listMatches();
    const updated = matches.filter(m => m.id !== matchId);
    localStorage.setItem('cric_matches', JSON.stringify(updated));
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

  // ------------------- TOURNAMENTS / SERIES -------------------
  async listTournaments() {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/tournaments`);
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch (err) {
        console.warn('API listTournaments failed, falling back to localStorage:', err);
      }
    }

    const raw = localStorage.getItem('cric_tournaments');
    return raw ? JSON.parse(raw) : [];
  },

  async saveTournament(tournament) {
    if (!tournament.id) tournament.id = 'tourney_' + Date.now();

    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/tournaments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tournament)
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const saved = await res.json();
        this.saveLocalTourneyBackup(saved);
        return saved;
      } catch (err) {
        console.warn('API saveTournament failed, falling back to localStorage:', err);
      }
    }

    return this.saveLocalTourneyBackup(tournament);
  },

  async deleteTournament(tournamentId) {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        await fetch(`${window.CRIC_API_BASE}/tournaments/${tournamentId}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('API deleteTournament failed:', err);
      }
    }

    const tourneys = await this.listTournaments();
    const updatedTourneys = tourneys.filter(t => t.id !== tournamentId);
    localStorage.setItem('cric_tournaments', JSON.stringify(updatedTourneys));

    const rawMatches = localStorage.getItem('cric_matches');
    if (rawMatches) {
      const matches = JSON.parse(rawMatches);
      const updatedMatches = matches.filter(m => m.tournamentId !== tournamentId);
      localStorage.setItem('cric_matches', JSON.stringify(updatedMatches));
    }

    return updatedTourneys;
  },

  saveLocalTourneyBackup(tournament) {
    const raw = localStorage.getItem('cric_tournaments');
    const tourneys = raw ? JSON.parse(raw) : [];
    const updated = [tournament, ...tourneys.filter(t => t.id !== tournament.id)];
    localStorage.setItem('cric_tournaments', JSON.stringify(updated));
    return tournament;
  },

  // ------------------- GLOBAL PLAYERS & TEAMS -------------------
  async listGlobalPlayers() {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/players`);
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch (err) {
        console.warn('API listGlobalPlayers failed, falling back to localStorage:', err);
      }
    }

    const raw = localStorage.getItem('cric_global_players');
    return raw ? JSON.parse(raw) : [];
  },

  async addGlobalPlayer(player) {
    player.id = player.id || 'gp_' + Date.now();

    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/players`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(player)
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const saved = await res.json();
        this.saveLocalPlayerBackup(saved);
        return saved;
      } catch (err) {
        console.warn('API addGlobalPlayer failed, falling back to localStorage:', err);
      }
    }

    return this.saveLocalPlayerBackup(player);
  },

  async deleteGlobalPlayer(playerId) {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        await fetch(`${window.CRIC_API_BASE}/players/${playerId}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('API deleteGlobalPlayer failed:', err);
      }
    }

    const players = await this.listGlobalPlayers();
    const updated = players.filter(p => p.id !== playerId);
    localStorage.setItem('cric_global_players', JSON.stringify(updated));
    return updated;
  },

  saveLocalPlayerBackup(player) {
    const raw = localStorage.getItem('cric_global_players');
    const players = raw ? JSON.parse(raw) : [];
    const updated = [player, ...players.filter(p => p.id !== player.id)];
    localStorage.setItem('cric_global_players', JSON.stringify(updated));
    return player;
  },

  // Total Reset Function
  async resetAllData() {
    localStorage.clear();
  }
};

window.CricStorage = CricStorage;
