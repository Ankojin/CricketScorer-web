// Storage Adapter supporting window.CRIC_API_BASE switch

window.CRIC_API_BASE = window.CRIC_API_BASE || "";

const CricStorage = {

  async listMatches() {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches`);
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return await res.json();
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
        return await res.json();
      } catch (err) {
        console.warn('API createMatch failed, saving to localStorage:', err);
      }
    }

    const matches = await this.listMatches();
    const updated = [match, ...matches.filter(m => m.id !== match.id)];
    localStorage.setItem('cric_matches', JSON.stringify(updated));
    localStorage.setItem('cric_active_match_id', match.id);
    return match;
  },

  async saveMatch(match) {
    match.updatedAt = new Date().toISOString();
    const matches = await this.listMatches();
    const updated = matches.map(m => m.id === match.id ? match : m);
    if (!updated.some(m => m.id === match.id)) {
      updated.unshift(match);
    }
    localStorage.setItem('cric_matches', JSON.stringify(updated));
    localStorage.setItem('cric_active_match_id', match.id);
    return match;
  },

  async addBall(matchId, ball) {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches/${matchId}/balls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ball)
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return await res.json();
      } catch (err) {
        console.warn('API addBall failed, falling back to local computation:', err);
      }
    }

    const match = await this.getMatch(matchId);
    if (!match) return null;

    match.ballHistory = [...(match.ballHistory || []), ball];
    const recalculated = window.ScoringEngine.recalculateMatch(match);
    return await this.saveMatch(recalculated);
  },

  async undoBall(matchId) {
    if (window.CRIC_API_BASE && window.CRIC_API_BASE.trim().length > 0) {
      try {
        const res = await fetch(`${window.CRIC_API_BASE}/matches/${matchId}/undo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return await res.json();
      } catch (err) {
        console.warn('API undoBall failed, falling back to local computation:', err);
      }
    }

    const match = await this.getMatch(matchId);
    if (!match || !match.ballHistory || match.ballHistory.length === 0) return match;

    match.ballHistory.pop();
    const recalculated = window.ScoringEngine.recalculateMatch(match);
    return await this.saveMatch(recalculated);
  }
};

window.CricStorage = CricStorage;
