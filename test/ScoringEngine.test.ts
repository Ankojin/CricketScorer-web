import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { ScoringEngine } from '../src/engine/ScoringEngine.js';
import { Match, Team, Player, Ball } from '../src/models/types.js';

describe('ScoringEngine Event-Sourced Recalculation Tests', () => {

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

  test('Toss required if tossWinnerId is null', () => {
    const unTossed: Match = { ...baseMatch, tossWinnerId: null };
    const res = ScoringEngine.recalculateMatchFromHistory(unTossed);
    assert.equal(res.pendingAction, 'TOSS_REQUIRED');
  });

  test('Legal balls increment totalBalls and totalRuns, and rotate strike on odd runs', () => {
    const ball1: Ball = {
      runs: 1,
      extrasType: 'NONE',
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1',
      rotateStrike: true
    };

    const matchWith1Ball: Match = { ...baseMatch, ballHistory: [ball1] };
    const res = ScoringEngine.recalculateMatchFromHistory(matchWith1Ball);

    assert.equal(res.totalRuns, 1);
    assert.equal(res.totalBalls, 1);
    assert.equal(res.totalWickets, 0);
    // Strike rotated because 1 run was scored
    assert.equal(res.strikerId, 'p2');
    assert.equal(res.nonStrikerId, 'p1');
    assert.equal(res.teamA.colorHex, '#FF5722');
  });

  test('Wides and No-Balls do NOT increment physical totalBalls', () => {
    const wideBall: Ball = {
      runs: 0,
      extrasType: 'WIDE',
      extraRuns: 1,
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    };

    const matchWithWide: Match = { ...baseMatch, ballHistory: [wideBall] };
    const res = ScoringEngine.recalculateMatchFromHistory(matchWithWide);

    assert.equal(res.totalRuns, 1);
    assert.equal(res.wideCount, 1);
    assert.equal(res.totalBalls, 0); // Wide is NOT a legal over ball
  });

  test('Retired Hurt is NOT a legal ball and NOT counted as a wicket', () => {
    const retiredHurtBall: Ball = {
      runs: 0,
      wicketType: 'RETIRED_HURT',
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1',
      outPlayerId: 'p1'
    };

    const matchWithRetired: Match = { ...baseMatch, ballHistory: [retiredHurtBall] };
    const res = ScoringEngine.recalculateMatchFromHistory(matchWithRetired);

    assert.equal(res.totalWickets, 0); // NOT a real wicket for dismissal count
    assert.equal(res.totalBalls, 0); // NOT a physical ball
    assert.equal(res.teamA.players[0].battingStats.isRetiredHurt, true);
    assert.equal(res.teamA.players[0].battingStats.isOut, false);
  });

  test('Chasing target in 2nd innings triggers match completion', () => {
    const completedInnings1Match: Match = {
      ...baseMatch,
      totalRuns: 10,
      totalBalls: 30, // 5 overs completed
      oversPerInnings: 5,
      ballHistory: Array(30).fill({
        runs: 0,
        extrasType: 'NONE',
        strikerId: 'p1',
        nonStrikerId: 'p2',
        bowlerId: 'b1'
      })
    };

    const res1 = ScoringEngine.recalculateMatchFromHistory(completedInnings1Match);
    assert.equal(res1.currentInnings, 2);
    assert.equal(res1.target, 1); // target = 0 + 1 = 1

    // Add 1 run in 2nd innings for teamB
    const winningBall: Ball = {
      runs: 1,
      extrasType: 'NONE',
      strikerId: 'b1',
      bowlerId: 'p1'
    };

    const secondInningsMatch: Match = {
      ...res1,
      isSecondInningsStarted: true,
      ballHistory: [...res1.ballHistory, winningBall]
    };

    const res2 = ScoringEngine.recalculateMatchFromHistory(secondInningsMatch);
    assert.equal(res2.status, 'COMPLETED');
    assert.equal(res2.winnerId, 'teamB');
  });
});
