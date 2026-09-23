import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { ScoringEngine } from '../src/engine/ScoringEngine.js';
import { Match, Team, Player, Ball } from '../src/models/types.js';

describe('ScoringEngine SWAP, GRANTED, and RETIRED_HURT Tests', () => {

  const player1: Player = {
    id: 'p1',
    name: 'Alice',
    battingStats: ScoringEngine.createDefaultBattingStats(),
    bowlingStats: ScoringEngine.createDefaultBowlingStats(),
    fieldingStats: ScoringEngine.createDefaultFieldingStats()
  };

  const player2: Player = {
    id: 'p2',
    name: 'Bob',
    battingStats: ScoringEngine.createDefaultBattingStats(),
    bowlingStats: ScoringEngine.createDefaultBowlingStats(),
    fieldingStats: ScoringEngine.createDefaultFieldingStats()
  };

  const bowler1: Player = {
    id: 'b1',
    name: 'Charlie',
    battingStats: ScoringEngine.createDefaultBattingStats(),
    bowlingStats: ScoringEngine.createDefaultBowlingStats(),
    fieldingStats: ScoringEngine.createDefaultFieldingStats()
  };

  const teamA: Team = {
    id: 'teamA',
    name: 'Rockets',
    colorHex: '#FF5722',
    players: [player1, player2]
  };

  const teamB: Team = {
    id: 'teamB',
    name: 'Thunder',
    colorHex: '#2196F3',
    players: [bowler1]
  };

  const baseMatch: Match = {
    id: 'match1',
    teamA,
    teamB,
    tossWinnerId: 'teamA',
    tossDecision: 'BAT',
    status: 'LIVE',
    currentInnings: 1,
    battingTeamId: 'teamA',
    bowlingTeamId: 'teamB',
    totalRuns: 0,
    totalWickets: 0,
    totalBalls: 0,
    wideCount: 0,
    noBallCount: 0,
    byeCount: 0,
    legByeCount: 0,
    ballHistory: [],
    wicketHistory: [],
    oversPerInnings: 5,
    gullyRules: {},
    pendingAction: 'NONE',
    battingOrder: [],
    dateMillis: Date.now()
  };

  test('SWAP adjustment ball swaps striker and non-striker without adding balls or runs', () => {
    const ball1: Ball = {
      runs: 0,
      extrasType: 'NONE',
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    };

    const swapBall: Ball = {
      isAdjustment: true,
      adjustmentSlot: 'SWAP',
      isLegalBall: false,
      runs: 0,
      extrasType: 'NONE',
      wicketType: 'NONE'
    };

    const matchWithSwap: Match = { ...baseMatch, ballHistory: [ball1, swapBall] };
    const res = ScoringEngine.recalculateMatchFromHistory(matchWithSwap);

    assert.equal(res.totalRuns, 0);
    assert.equal(res.totalBalls, 1);
    assert.equal(res.strikerId, 'p2');
    assert.equal(res.nonStrikerId, 'p1');
  });

  test('GRANTED 1G run adds run to total and striker stats, counts as legal ball, and does NOT rotate strike', () => {
    const grantedBall: Ball = {
      runs: 1,
      extrasType: 'GRANTED',
      extraRuns: 0,
      isLegalBall: true,
      rotateStrike: false,
      wicketType: 'NONE',
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    };

    const matchWithGranted: Match = { ...baseMatch, ballHistory: [grantedBall] };
    const res = ScoringEngine.recalculateMatchFromHistory(matchWithGranted);

    assert.equal(res.totalRuns, 1);
    assert.equal(res.totalBalls, 1);
    // Strike is NOT rotated
    assert.equal(res.strikerId, 'p1');
    assert.equal(res.nonStrikerId, 'p2');
    assert.equal(res.teamA.players[0].battingStats.runs, 1);
  });

  test('RETIRED_HURT ball marks batter isRetiredHurt, does NOT increment totalWickets, and prompts select striker', () => {
    const retiredHurtBall: Ball = {
      runs: 0,
      wicketType: 'RETIRED_HURT',
      isLegalBall: false,
      outPlayerId: 'p1',
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    };

    const matchWithRetired: Match = { ...baseMatch, ballHistory: [retiredHurtBall] };
    const res = ScoringEngine.recalculateMatchFromHistory(matchWithRetired);

    assert.equal(res.totalWickets, 0); // NOT a real wicket for totalWickets
    assert.equal(res.totalBalls, 0); // NOT a physical ball
    assert.equal(res.teamA.players[0].battingStats.isRetiredHurt, true);
    assert.equal(res.teamA.players[0].battingStats.isOut, false);
    assert.equal(res.strikerId, null);
    assert.equal(res.pendingAction, 'SELECT_STRIKER');
  });
});
