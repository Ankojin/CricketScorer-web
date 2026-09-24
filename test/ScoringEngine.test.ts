import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { ScoringEngine } from '../src/engine/ScoringEngine.ts';
import type { Match, Team, Player, Ball } from '../src/models/types.ts';

describe('ScoringEngine Core Rules & Transition Tests', () => {

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

  const player3: Player = {
    id: 'p3',
    name: 'Charlie',
    battingStats: ScoringEngine.createDefaultBattingStats(),
    bowlingStats: ScoringEngine.createDefaultBowlingStats(),
    fieldingStats: ScoringEngine.createDefaultFieldingStats()
  };

  const bowler1: Player = {
    id: 'b1',
    name: 'Dave',
    battingStats: ScoringEngine.createDefaultBattingStats(),
    bowlingStats: ScoringEngine.createDefaultBowlingStats(),
    fieldingStats: ScoringEngine.createDefaultFieldingStats()
  };

  const bowler2: Player = {
    id: 'b2',
    name: 'Eve',
    battingStats: ScoringEngine.createDefaultBattingStats(),
    bowlingStats: ScoringEngine.createDefaultBowlingStats(),
    fieldingStats: ScoringEngine.createDefaultFieldingStats()
  };

  const bowler3: Player = {
    id: 'b3',
    name: 'Frank',
    battingStats: ScoringEngine.createDefaultBattingStats(),
    bowlingStats: ScoringEngine.createDefaultBowlingStats(),
    fieldingStats: ScoringEngine.createDefaultFieldingStats()
  };

  const teamA: Team = {
    id: 'teamA',
    name: 'Rockets',
    colorHex: '#FF5722',
    players: [player1, player2, player3]
  };

  const teamB: Team = {
    id: 'teamB',
    name: 'Thunder',
    colorHex: '#2196F3',
    players: [bowler1, bowler2, bowler3]
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
    oversPerInnings: 1, // 1 over match for quick tests
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

  test('Wide and No-Ball do NOT count as physical over balls', () => {
    const wideBall: Ball = {
      runs: 0,
      extrasType: 'WIDE',
      extraRuns: 1,
      isLegalBall: false,
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    };

    const noBall: Ball = {
      runs: 1,
      extrasType: 'NO_BALL',
      extraRuns: 1,
      isLegalBall: false,
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    };

    const dotBall: Ball = {
      runs: 0,
      extrasType: 'NONE',
      isLegalBall: true,
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    };

    const match: Match = { ...baseMatch, ballHistory: [wideBall, noBall, dotBall] };
    const res = ScoringEngine.recalculateMatchFromHistory(match);

    assert.equal(res.totalRuns, 3); // 1 (wide) + 2 (no-ball + run) + 0
    assert.equal(res.totalBalls, 1); // Only 1 physical ball (dot ball)
  });

  test('NO_BALL with 4 bat runs adds 5 total runs, credits batter 4 runs, charges bowler 5 runs, does NOT increment legal balls', () => {
    const noBall4: Ball = {
      runs: 4,
      extrasType: 'NO_BALL',
      extraRuns: 1,
      isLegalBall: false,
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    };

    const match: Match = { ...baseMatch, ballHistory: [noBall4] };
    const res = ScoringEngine.recalculateMatchFromHistory(match);

    assert.equal(res.totalRuns, 5); // 4 bat + 1 no-ball
    assert.equal(res.totalBalls, 0); // Not a legal ball
    assert.equal(res.teamA.players[0].battingStats.runs, 4); // Batter gets 4
    assert.equal(res.teamA.players[0].battingStats.fours, 1);
    assert.equal(res.teamB.players[0].bowlingStats.runsConceded, 5); // Bowler charged 5
    assert.equal(res.teamB.players[0].bowlingStats.noBalls, 1);
  });

  test('BYE with 2 extra runs adds 2 total runs, increments legal balls, charges 0 to bowler', () => {
    const bye2: Ball = {
      runs: 0,
      extrasType: 'BYE',
      extraRuns: 2,
      isLegalBall: true,
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    };

    const match: Match = { ...baseMatch, ballHistory: [bye2] };
    const res = ScoringEngine.recalculateMatchFromHistory(match);

    assert.equal(res.totalRuns, 2);
    assert.equal(res.totalBalls, 1); // Legal ball
    assert.equal(res.byeCount, 2);
    assert.equal(res.teamA.players[0].battingStats.runs, 0); // Batter gets 0
    assert.equal(res.teamB.players[0].bowlingStats.runsConceded, 0); // Bowler not charged for byes
    assert.equal(res.strikerId, 'p1'); // 2 runs (even) -> no strike rotation
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

  test('End of Over rotates strike, resets currentBowlerId to null, sets lastBowlerId, and prompts SELECT_BOWLER', () => {
    const overBalls: Ball[] = Array.from({ length: 6 }, () => ({
      runs: 0,
      extrasType: 'NONE',
      isLegalBall: true,
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    }));

    const match: Match = { ...baseMatch, oversPerInnings: 2, ballHistory: overBalls };
    const res = ScoringEngine.recalculateMatchFromHistory(match);

    assert.equal(res.totalBalls, 6);
    assert.equal(res.strikerId, 'p2'); // Rotated strike
    assert.equal(res.nonStrikerId, 'p1');
    assert.equal(res.currentBowlerId, null); // Bowler cleared
    assert.equal(res.lastBowlerId, 'b1');
    assert.equal(res.pendingAction, 'SELECT_BOWLER');
  });

  test('Innings 1 to Innings 2 transition sets target = Innings 1 runs + 1', () => {
    // 6 balls in 1-over innings scoring 10 runs
    const overBalls: Ball[] = [
      { runs: 4, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' }
    ];

    const match: Match = { ...baseMatch, oversPerInnings: 1, ballHistory: overBalls };
    const res = ScoringEngine.recalculateMatchFromHistory(match);

    assert.equal(res.currentInnings, 2);
    assert.equal(res.target, 11); // 10 runs + 1
    assert.equal(res.battingTeamId, 'teamB');
    assert.equal(res.bowlingTeamId, 'teamA');
    assert.equal(res.totalRuns, 0); // Reset for 2nd innings
    assert.equal(res.totalWickets, 0);
  });

  test('Match completes when Chasing Team B reaches target in 2nd Innings', () => {
    // Innings 1: 10 runs scored
    const i1Balls: Ball[] = [
      { runs: 4, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' }
    ];

    // Innings 2: Team B scores 11 runs (6 + 6)
    const i2Balls: Ball[] = [
      { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'p1' },
      { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'p1' }
    ];

    const match: Match = { ...baseMatch, oversPerInnings: 1, ballHistory: [...i1Balls, ...i2Balls] };
    const res = ScoringEngine.recalculateMatchFromHistory(match);

    assert.equal(res.status, 'COMPLETED');
    assert.equal(res.winnerId, 'teamB');
  });

  test('Match completes when Chasing Team B is all out short of target', () => {
    // Innings 1: 10 runs scored (Target = 11)
    const i1Balls: Ball[] = [
      { runs: 4, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
      { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' }
    ];

    // Innings 2: Team B (2 players) loses 1 wicket in 2-player squad (maxWickets = 1) scoring 2 runs
    const teamB2Players = { ...teamB, players: [bowler1, bowler2] };
    const i2Balls: Ball[] = [
      { runs: 2, extrasType: 'NONE', isLegalBall: true, wicketType: 'BOWLED', strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'p1' }
    ];

    const match: Match = { ...baseMatch, teamB: teamB2Players, oversPerInnings: 1, ballHistory: [...i1Balls, ...i2Balls] };
    const res = ScoringEngine.recalculateMatchFromHistory(match);

    assert.equal(res.status, 'COMPLETED');
    assert.equal(res.winnerId, 'teamA'); // Defending team A wins
  });

  test('1G / 1D (rotateStrike = false, runs = 1) counts as 1 physical ball, no mid-over strike rotation; on 6th ball strike swaps', () => {
    // 1st ball: 1G (rotateStrike = false)
    const ball1G: Ball = {
      runs: 1,
      extrasType: 'NONE',
      isLegalBall: true,
      rotateStrike: false,
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    };

    const match1: Match = { ...baseMatch, ballHistory: [ball1G] };
    const res1 = ScoringEngine.recalculateMatchFromHistory(match1);

    assert.equal(res1.totalRuns, 1);
    assert.equal(res1.totalBalls, 1); // Counts as 1 physical ball
    assert.equal(res1.strikerId, 'p1'); // NO mid-over strike rotation!
    assert.equal(res1.nonStrikerId, 'p2');

    // 6 balls of 1G in an over
    const overBalls: Ball[] = Array.from({ length: 6 }, () => ({
      runs: 1,
      extrasType: 'NONE',
      isLegalBall: true,
      rotateStrike: false,
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    }));

    const match6: Match = { ...baseMatch, oversPerInnings: 2, ballHistory: overBalls };
    const res6 = ScoringEngine.recalculateMatchFromHistory(match6);

    assert.equal(res6.totalRuns, 6);
    assert.equal(res6.totalBalls, 6);
    assert.equal(res6.strikerId, 'p2'); // Strike swaps on 6th ball (end of over)!
    assert.equal(res6.nonStrikerId, 'p1');
    assert.equal(res6.currentBowlerId, null);
  });

  test('CAUGHT wicket attaches fielderId, updates dismissalFielderId and fielder catches stats', () => {
    const catchBall: Ball = {
      runs: 0,
      extrasType: 'NONE',
      wicketType: 'CAUGHT',
      fielderId: 'b2', // Eve caught it
      isLegalBall: true,
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    };

    const match: Match = { ...baseMatch, ballHistory: [catchBall] };
    const res = ScoringEngine.recalculateMatchFromHistory(match);

    assert.strictEqual(res.totalWickets, 1);
    assert.strictEqual(res.teamA.players[0].battingStats.isOut, true);
    assert.strictEqual(res.teamA.players[0].battingStats.dismissalFielderId, 'b2');
    assert.strictEqual(res.teamB.players[1].fieldingStats?.catches, 1);
  });

  test('RUN_OUT wicket attaches outPlayerId and fielderId, does NOT count as bowler wicket', () => {
    const runOutBall: Ball = {
      runs: 1,
      extrasType: 'NONE',
      wicketType: 'RUN_OUT',
      outPlayerId: 'p2', // Non-striker run out
      fielderId: 'b2',
      isLegalBall: true,
      strikerId: 'p1',
      nonStrikerId: 'p2',
      bowlerId: 'b1'
    };

    const match: Match = { ...baseMatch, ballHistory: [runOutBall] };
    const res = ScoringEngine.recalculateMatchFromHistory(match);

    assert.equal(res.totalRuns, 1); // 1 run completed
    assert.equal(res.totalWickets, 1);
    assert.equal(res.teamA.players[1].battingStats.isOut, true); // Non-striker out
    assert.equal(res.teamA.players[1].battingStats.dismissalFielderId, 'b2');
    assert.equal(res.teamB.players[0].bowlingStats.wickets, 0); // NOT a bowler wicket!
    assert.equal(res.teamB.players[1].fieldingStats?.runOuts, 1);
    assert.equal(res.strikerId, null); // Striker slot empty because 1 run completed & rotated
    assert.equal(res.nonStrikerId, 'p1'); // Remaining batter p1 moved to non-striker
    assert.equal(res.pendingAction, 'SELECT_STRIKER');
  });
});
