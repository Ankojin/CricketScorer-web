// Storage Adapter supporting window.CRIC_API_BASE switch

window.CRIC_API_BASE = window.CRIC_API_BASE || "";

const CricStorage = {

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
        this.saveLocalBackup(saved);
        return saved;
      } catch (err) {
        console.warn('API createMatch failed, saving to localStorage:', err);
      }
    }

    return this.saveLocalBackup(match);
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
        this.saveLocalBackup(saved);
        return saved;
      } catch (err) {
        console.warn('API saveMatch failed, updating localStorage:', err);
      }
    }

    return this.saveLocalBackup(match);
  },

  saveLocalBackup(match) {
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

  // Tournaments Storage
  async listTournaments() {
    const raw = localStorage.getItem('cric_tournaments');
    return raw ? JSON.parse(raw) : [];
  },

  async saveTournament(tournament) {
    const tourneys = await this.listTournaments();
    const updated = [tournament, ...tourneys.filter(t => t.id !== tournament.id)];
    localStorage.setItem('cric_tournaments', JSON.stringify(updated));
    return tournament;
  },

  // Global Player Directory Storage
  async listGlobalPlayers() {
    const raw = localStorage.getItem('cric_global_players');
    return raw ? JSON.parse(raw) : [
      { id: 'gp1', name: 'Alice', style: 'RHB', role: 'Batter' },
      { id: 'gp2', name: 'Bob', style: 'LHB', role: 'All-Rounder' },
      { id: 'gp3', name: 'Charlie', style: 'RHB', role: 'Bowler' },
      { id: 'gp4', name: 'David', style: 'RHB', role: 'Wicket-Keeper' },
      { id: 'gp5', name: 'Eve', style: 'LHB', role: 'Batter' },
      { id: 'gp6', name: 'Frank', style: 'RHB', role: 'Bowler' }
    ];
  },

  async addGlobalPlayer(player) {
    const players = await this.listGlobalPlayers();
    player.id = player.id || 'gp_' + Date.now();
    const updated = [player, ...players.filter(p => p.id !== player.id)];
    localStorage.setItem('cric_global_players', JSON.stringify(updated));
    return updated;
  }
};

window.CricStorage = CricStorage;
