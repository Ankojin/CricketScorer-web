import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { ScoringEngine } from '../src/engine/ScoringEngine.js';
describe('ScoringEngine Core Rules & Transition Tests', () => {
    const player1 = {
        id: 'p1',
        name: 'Alice',
        battingStats: ScoringEngine.createDefaultBattingStats(),
        bowlingStats: ScoringEngine.createDefaultBowlingStats(),
        fieldingStats: ScoringEngine.createDefaultFieldingStats()
    };
    const player2 = {
        id: 'p2',
        name: 'Bob',
        battingStats: ScoringEngine.createDefaultBattingStats(),
        bowlingStats: ScoringEngine.createDefaultBowlingStats(),
        fieldingStats: ScoringEngine.createDefaultFieldingStats()
    };
    const player3 = {
        id: 'p3',
        name: 'Charlie',
        battingStats: ScoringEngine.createDefaultBattingStats(),
        bowlingStats: ScoringEngine.createDefaultBowlingStats(),
        fieldingStats: ScoringEngine.createDefaultFieldingStats()
    };
    const bowler1 = {
        id: 'b1',
        name: 'Dave',
        battingStats: ScoringEngine.createDefaultBattingStats(),
        bowlingStats: ScoringEngine.createDefaultBowlingStats(),
        fieldingStats: ScoringEngine.createDefaultFieldingStats()
    };
    const bowler2 = {
        id: 'b2',
        name: 'Eve',
        battingStats: ScoringEngine.createDefaultBattingStats(),
        bowlingStats: ScoringEngine.createDefaultBowlingStats(),
        fieldingStats: ScoringEngine.createDefaultFieldingStats()
    };
    const bowler3 = {
        id: 'b3',
        name: 'Frank',
        battingStats: ScoringEngine.createDefaultBattingStats(),
        bowlingStats: ScoringEngine.createDefaultBowlingStats(),
        fieldingStats: ScoringEngine.createDefaultFieldingStats()
    };
    const teamA = {
        id: 'teamA',
        name: 'Rockets',
        colorHex: '#FF5722',
        players: [player1, player2, player3]
    };
    const teamB = {
        id: 'teamB',
        name: 'Thunder',
        colorHex: '#2196F3',
        players: [bowler1, bowler2, bowler3]
    };
    const baseMatch = {
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
        const ball1 = {
            runs: 0,
            extrasType: 'NONE',
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const swapBall = {
            isAdjustment: true,
            adjustmentSlot: 'SWAP',
            isLegalBall: false,
            runs: 0,
            extrasType: 'NONE',
            wicketType: 'NONE'
        };
        const matchWithSwap = { ...baseMatch, ballHistory: [ball1, swapBall] };
        const res = ScoringEngine.recalculateMatchFromHistory(matchWithSwap);
        assert.equal(res.totalRuns, 0);
        assert.equal(res.totalBalls, 1);
        assert.equal(res.strikerId, 'p2');
        assert.equal(res.nonStrikerId, 'p1');
    });
    test('Wide and No-Ball do NOT count as physical over balls', () => {
        const wideBall = {
            runs: 0,
            extrasType: 'WIDE',
            extraRuns: 1,
            isLegalBall: false,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const noBall = {
            runs: 1,
            extrasType: 'NO_BALL',
            extraRuns: 1,
            isLegalBall: false,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const dotBall = {
            runs: 0,
            extrasType: 'NONE',
            isLegalBall: true,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const match = { ...baseMatch, ballHistory: [wideBall, noBall, dotBall] };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.totalRuns, 3); // 1 (wide) + 2 (no-ball + run) + 0
        assert.equal(res.totalBalls, 1); // Only 1 physical ball (dot ball)
    });
    test('WIDE with 4 additional runs adds 5 total extras and does NOT increment legal balls', () => {
        const widePlus4 = {
            runs: 0,
            extrasType: 'WIDE',
            extraRuns: 5,
            isLegalBall: false,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const match = { ...baseMatch, ballHistory: [widePlus4] };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.totalRuns, 5);
        assert.equal(res.wideCount, 5);
        assert.equal(res.totalBalls, 0);
        assert.equal(res.teamB.players[0].bowlingStats.runsConceded, 5);
        assert.equal(res.teamB.players[0].bowlingStats.wides, 1);
    });
    test('WIDE additional runs options 0-4 produce expected totals and no legal-ball increment', () => {
        for (let extraTaken = 0; extraTaken <= 4; extraTaken++) {
            const wideBall = {
                runs: 0,
                extrasType: 'WIDE',
                extraRuns: 1 + extraTaken,
                isLegalBall: false,
                strikerId: 'p1',
                nonStrikerId: 'p2',
                bowlerId: 'b1'
            };
            const match = { ...baseMatch, ballHistory: [wideBall] };
            const res = ScoringEngine.recalculateMatchFromHistory(match);
            assert.equal(res.totalRuns, 1 + extraTaken);
            assert.equal(res.wideCount, 1 + extraTaken);
            assert.equal(res.totalBalls, 0);
            assert.equal(res.teamB.players[0].bowlingStats.wides, 1);
            assert.equal(res.teamB.players[0].bowlingStats.runsConceded, 1 + extraTaken);
        }
    });
    test('NO_BALL with 4 bat runs adds 5 total runs, credits batter 4 runs, charges bowler 5 runs, does NOT increment legal balls', () => {
        const noBall4 = {
            runs: 4,
            extrasType: 'NO_BALL',
            extraRuns: 1,
            isLegalBall: false,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const match = { ...baseMatch, ballHistory: [noBall4] };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.totalRuns, 5); // 4 bat + 1 no-ball
        assert.equal(res.totalBalls, 0); // Not a legal ball
        assert.equal(res.teamA.players[0].battingStats.runs, 4); // Batter gets 4
        assert.equal(res.teamA.players[0].battingStats.fours, 1);
        assert.equal(res.teamB.players[0].bowlingStats.runsConceded, 5); // Bowler charged 5
        assert.equal(res.teamB.players[0].bowlingStats.noBalls, 1);
    });
    test('BYE with 2 extra runs adds 2 total runs, increments legal balls, charges 0 to bowler', () => {
        const bye2 = {
            runs: 0,
            extrasType: 'BYE',
            extraRuns: 2,
            isLegalBall: true,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const match = { ...baseMatch, ballHistory: [bye2] };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.totalRuns, 2);
        assert.equal(res.totalBalls, 1); // Legal ball
        assert.equal(res.byeCount, 2);
        assert.equal(res.teamA.players[0].battingStats.runs, 0); // Batter gets 0
        assert.equal(res.teamB.players[0].bowlingStats.runsConceded, 0); // Bowler not charged for byes
        assert.equal(res.strikerId, 'p1'); // 2 runs (even) -> no strike rotation
    });
    test('RETIRED_HURT ball marks batter isRetiredHurt, does NOT increment totalWickets, and prompts select striker', () => {
        const retiredHurtBall = {
            runs: 0,
            wicketType: 'RETIRED_HURT',
            isLegalBall: false,
            outPlayerId: 'p1',
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const matchWithRetired = { ...baseMatch, ballHistory: [retiredHurtBall] };
        const res = ScoringEngine.recalculateMatchFromHistory(matchWithRetired);
        assert.equal(res.totalWickets, 0); // NOT a real wicket for totalWickets
        assert.equal(res.totalBalls, 0); // NOT a physical ball
        assert.equal(res.teamA.players[0].battingStats.isRetiredHurt, true);
        assert.equal(res.teamA.players[0].battingStats.isOut, false);
        assert.equal(res.strikerId, null);
        assert.equal(res.pendingAction, 'SELECT_STRIKER');
    });
    test('End of Over rotates strike, resets currentBowlerId to null, sets lastBowlerId, and prompts SELECT_BOWLER', () => {
        const overBalls = Array.from({ length: 6 }, () => ({
            runs: 0,
            extrasType: 'NONE',
            isLegalBall: true,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        }));
        const match = { ...baseMatch, oversPerInnings: 2, ballHistory: overBalls };
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
        const overBalls = [
            { runs: 4, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' }
        ];
        const match = { ...baseMatch, oversPerInnings: 1, ballHistory: overBalls };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.currentInnings, 2);
        assert.equal(res.target, 11); // 10 runs + 1
        assert.equal(res.battingTeamId, 'teamB');
        assert.equal(res.bowlingTeamId, 'teamA');
        assert.equal(res.totalRuns, 0); // Reset for 2nd innings
        assert.equal(res.totalWickets, 0);
    });
    test('2nd innings manual selections persist before first innings-2 ball', () => {
        const i1Balls = [
            { runs: 4, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' }
        ];
        const match = {
            ...baseMatch,
            oversPerInnings: 1,
            ballHistory: i1Balls,
            currentInnings: 2,
            isSecondInningsStarted: true,
            battingTeamId: 'teamB',
            bowlingTeamId: 'teamA',
            strikerId: 'b1',
            nonStrikerId: 'b2',
            currentBowlerId: 'p1',
            pendingAction: 'NONE'
        };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.currentInnings, 2);
        assert.equal(res.strikerId, 'b1');
        assert.equal(res.nonStrikerId, 'b2');
        assert.equal(res.currentBowlerId, 'p1');
        assert.equal(res.pendingAction, 'NONE');
    });
    test('Editing a historical legal ball and recalculating updates totals and batter stats deterministically', () => {
        const originalHistory = [
            { runs: 1, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p2', nonStrikerId: 'p1', bowlerId: 'b1' }
        ];
        const base = ScoringEngine.recalculateMatchFromHistory({ ...baseMatch, ballHistory: originalHistory });
        assert.equal(base.totalRuns, 1);
        assert.equal(base.totalBalls, 2);
        assert.equal(base.teamA.players[0].battingStats.runs, 1);
        assert.equal(base.teamA.players[1].battingStats.runs, 0);
        const editedHistory = [...originalHistory];
        editedHistory[1] = { ...editedHistory[1], runs: 4 };
        const edited = ScoringEngine.recalculateMatchFromHistory({ ...baseMatch, ballHistory: editedHistory });
        assert.equal(edited.totalRuns, 5);
        assert.equal(edited.totalBalls, 2);
        assert.equal(edited.teamA.players[0].battingStats.runs, 1);
        assert.equal(edited.teamA.players[1].battingStats.runs, 4);
        assert.equal(edited.teamA.players[1].battingStats.fours, 1);
        assert.equal(edited.teamB.players[0].bowlingStats.runsConceded, 5);
    });
    test('Match completes when Chasing Team B reaches target in 2nd Innings', () => {
        // Innings 1: 10 runs scored
        const i1Balls = [
            { runs: 4, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' }
        ];
        // Innings 2: Team B scores 11 runs (6 + 6)
        const i2Balls = [
            { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'p1' },
            { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'p1' }
        ];
        const match = { ...baseMatch, oversPerInnings: 1, ballHistory: [...i1Balls, ...i2Balls] };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.status, 'COMPLETED');
        assert.equal(res.winnerId, 'teamB');
    });
    test('Match completes when Chasing Team B is all out short of target', () => {
        // Innings 1: 10 runs scored (Target = 11)
        const i1Balls = [
            { runs: 4, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' }
        ];
        // Innings 2: Team B (2 players) loses 1 wicket in 2-player squad (maxWickets = 1) scoring 2 runs
        const teamB2Players = { ...teamB, players: [bowler1, bowler2] };
        const i2Balls = [
            { runs: 2, extrasType: 'NONE', isLegalBall: true, wicketType: 'BOWLED', strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'p1' }
        ];
        const match = { ...baseMatch, teamB: teamB2Players, oversPerInnings: 1, ballHistory: [...i1Balls, ...i2Balls] };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.status, 'COMPLETED');
        assert.equal(res.winnerId, 'teamA'); // Defending team A wins
    });
    test('1G / 1D (rotateStrike = false, runs = 1) counts as 1 physical ball, no mid-over strike rotation; on 6th ball strike swaps', () => {
        // 1st ball: 1G (rotateStrike = false)
        const ball1G = {
            runs: 1,
            extrasType: 'NONE',
            isLegalBall: true,
            rotateStrike: false,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const match1 = { ...baseMatch, ballHistory: [ball1G] };
        const res1 = ScoringEngine.recalculateMatchFromHistory(match1);
        assert.equal(res1.totalRuns, 1);
        assert.equal(res1.totalBalls, 1); // Counts as 1 physical ball
        assert.equal(res1.strikerId, 'p1'); // NO mid-over strike rotation!
        assert.equal(res1.nonStrikerId, 'p2');
        // 6 balls of 1G in an over
        const overBalls = Array.from({ length: 6 }, () => ({
            runs: 1,
            extrasType: 'NONE',
            isLegalBall: true,
            rotateStrike: false,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        }));
        const match6 = { ...baseMatch, oversPerInnings: 2, ballHistory: overBalls };
        const res6 = ScoringEngine.recalculateMatchFromHistory(match6);
        assert.equal(res6.totalRuns, 6);
        assert.equal(res6.totalBalls, 6);
        assert.equal(res6.strikerId, 'p2'); // Strike swaps on 6th ball (end of over)!
        assert.equal(res6.nonStrikerId, 'p1');
        assert.equal(res6.currentBowlerId, null);
    });
    test('CAUGHT wicket attaches fielderId, updates dismissalFielderId and fielder catches stats', () => {
        const catchBall = {
            runs: 0,
            extrasType: 'NONE',
            wicketType: 'CAUGHT',
            fielderId: 'b2', // Eve caught it
            isLegalBall: true,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const match = { ...baseMatch, ballHistory: [catchBall] };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.strictEqual(res.totalWickets, 1);
        assert.strictEqual(res.teamA.players[0].battingStats.isOut, true);
        assert.strictEqual(res.teamA.players[0].battingStats.dismissalFielderId, 'b2');
        assert.strictEqual(res.teamB.players[1].fieldingStats?.catches, 1);
    });
    test('RUN_OUT wicket attaches outPlayerId and fielderId, does NOT count as bowler wicket', () => {
        const runOutBall = {
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
        const match = { ...baseMatch, ballHistory: [runOutBall] };
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
    test('RUN_OUT two-step variants for striker/non-striker preserve wicket attribution and selection prompts', () => {
        const strikerRunOutBall = {
            runs: 0,
            extrasType: 'NONE',
            wicketType: 'RUN_OUT',
            outPlayerId: 'p1',
            fielderId: 'b2',
            isLegalBall: true,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const strikerRunOut = ScoringEngine.recalculateMatchFromHistory({
            ...baseMatch,
            ballHistory: [strikerRunOutBall]
        });
        assert.equal(strikerRunOut.totalRuns, 0);
        assert.equal(strikerRunOut.totalWickets, 1);
        assert.equal(strikerRunOut.teamA.players[0].battingStats.isOut, true);
        assert.equal(strikerRunOut.teamA.players[1].battingStats.isOut, false);
        assert.equal(strikerRunOut.strikerId, null);
        assert.equal(strikerRunOut.nonStrikerId, 'p2');
        assert.equal(strikerRunOut.pendingAction, 'SELECT_STRIKER');
        assert.equal(strikerRunOut.teamB.players[1].fieldingStats?.runOuts, 1);
        const nonStrikerRunOutBall = {
            runs: 2,
            extrasType: 'NONE',
            wicketType: 'RUN_OUT',
            outPlayerId: 'p2',
            fielderId: 'b2',
            isLegalBall: true,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const nonStrikerRunOut = ScoringEngine.recalculateMatchFromHistory({
            ...baseMatch,
            ballHistory: [nonStrikerRunOutBall]
        });
        assert.equal(nonStrikerRunOut.totalRuns, 2);
        assert.equal(nonStrikerRunOut.totalWickets, 1);
        assert.equal(nonStrikerRunOut.teamA.players[1].battingStats.isOut, true);
        assert.equal(nonStrikerRunOut.teamA.players[0].battingStats.isOut, false);
        assert.equal(nonStrikerRunOut.strikerId, 'p1');
        assert.equal(nonStrikerRunOut.nonStrikerId, null);
        assert.equal(nonStrikerRunOut.pendingAction, 'SELECT_NON_STRIKER');
        assert.equal(nonStrikerRunOut.teamB.players[1].fieldingStats?.runOuts, 1);
    });
    test('STUMPED dismissal records bowler/fielder linkage and increments keeper stumpings', () => {
        const stumpedBall = {
            runs: 0,
            extrasType: 'NONE',
            wicketType: 'STUMPED',
            fielderId: 'b2',
            isLegalBall: true,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const match = { ...baseMatch, ballHistory: [stumpedBall] };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.totalWickets, 1);
        assert.equal(res.wicketHistory.length, 1);
        assert.equal(res.wicketHistory[0].wicketType, 'STUMPED');
        assert.equal(res.wicketHistory[0].bowlerName, 'Dave');
        assert.equal(res.wicketHistory[0].fielderName, 'Eve');
        assert.equal(res.teamA.players[0].battingStats.dismissalBowlerId, 'b1');
        assert.equal(res.teamA.players[0].battingStats.dismissalFielderId, 'b2');
        assert.equal(res.teamB.players[1].fieldingStats?.stumpings, 1);
    });
    test('HANDLED_BALL wicket is recorded as a wicket type and increments wicket state', () => {
        const handledBall = {
            runs: 0,
            extrasType: 'NONE',
            wicketType: 'HANDLED_BALL',
            isLegalBall: true,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        };
        const match = { ...baseMatch, ballHistory: [handledBall] };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.totalWickets, 1);
        assert.equal(res.wicketHistory.length, 1);
        assert.equal(res.wicketHistory[0].wicketType, 'HANDLED_BALL');
        assert.equal(res.teamA.players[0].battingStats.isOut, true);
        assert.equal(res.teamA.players[0].battingStats.wicketType, 'HANDLED_BALL');
    });
    test('max overs quota yields over-break bowler change requirement', () => {
        const history = [
            ...Array.from({ length: 6 }, () => ({
                runs: 0,
                extrasType: 'NONE',
                isLegalBall: true,
                strikerId: 'p1',
                nonStrikerId: 'p2',
                bowlerId: 'b1'
            })),
            {
                runs: 1,
                extrasType: 'NONE',
                isLegalBall: true,
                strikerId: 'p2',
                nonStrikerId: 'p1',
                bowlerId: 'b2'
            }
        ];
        const match = {
            ...baseMatch,
            oversPerInnings: 2,
            maxOversPerBowler: 1,
            ballHistory: history
        };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.lastBowlerId, 'b1');
        assert.equal(res.teamB.players[0].bowlingStats.overs, 1);
        assert.equal(res.teamB.players[1].bowlingStats.balls, 1);
        assert.equal(res.currentBowlerId, 'b2');
    });
    test('quota bowlers count caps unique bowlers used in innings history', () => {
        const history = [
            ...Array.from({ length: 6 }, () => ({
                runs: 0,
                extrasType: 'NONE',
                isLegalBall: true,
                strikerId: 'p1',
                nonStrikerId: 'p2',
                bowlerId: 'b1'
            })),
            ...Array.from({ length: 6 }, () => ({
                runs: 0,
                extrasType: 'NONE',
                isLegalBall: true,
                strikerId: 'p2',
                nonStrikerId: 'p1',
                bowlerId: 'b2'
            }))
        ];
        const match = {
            ...baseMatch,
            oversPerInnings: 3,
            quotaBowlersCount: 2,
            ballHistory: history
        };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        const usedBowlerIds = new Set((res.ballHistory || []).map(b => b.bowlerId).filter(Boolean));
        assert.equal(usedBowlerIds.size, 2);
        assert.equal(usedBowlerIds.has('b1'), true);
        assert.equal(usedBowlerIds.has('b2'), true);
        assert.equal(usedBowlerIds.has('b3'), false);
        assert.equal(res.pendingAction, 'SELECT_BOWLER');
        assert.equal(res.lastBowlerId, 'b2');
    });
    test('last-bowler fallback scenario remains selectable when quota bowlers count is 1', () => {
        const history = Array.from({ length: 6 }, () => ({
            runs: 0,
            extrasType: 'NONE',
            isLegalBall: true,
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        }));
        const match = {
            ...baseMatch,
            oversPerInnings: 2,
            quotaBowlersCount: 1,
            quotaMaxOvers: 4,
            ballHistory: history
        };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.pendingAction, 'SELECT_BOWLER');
        assert.equal(res.lastBowlerId, 'b1');
        assert.equal(res.currentBowlerId, null);
        assert.equal(res.teamB.players[0].bowlingStats.overs, 1);
    });
    test('ABANDONED status is preserved even if innings-2 history reaches target', () => {
        const i1Balls = [
            { runs: 4, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
            { runs: 0, extrasType: 'NONE', isLegalBall: true, strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' }
        ];
        const i2Balls = [
            { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'p1' },
            { runs: 6, extrasType: 'NONE', isLegalBall: true, strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'p1' }
        ];
        const match = {
            ...baseMatch,
            status: 'ABANDONED',
            winnerId: null,
            oversPerInnings: 1,
            ballHistory: [...i1Balls, ...i2Balls]
        };
        const res = ScoringEngine.recalculateMatchFromHistory(match);
        assert.equal(res.status, 'ABANDONED');
        assert.equal(res.winnerId, null);
        assert.equal(res.currentInnings, 2);
        assert.equal(res.totalRuns, 12);
    });
    test('Points table sorts tied points by NRR (desc)', () => {
        const teams = [
            { ...teamA, id: 'A', name: 'Team A' },
            { ...teamB, id: 'B', name: 'Team B' },
            { ...teamB, id: 'C', name: 'Team C', players: [bowler1, bowler2] }
        ];
        const m1 = {
            ...baseMatch,
            id: 'm1',
            teamA: teams[0],
            teamB: teams[1],
            battingTeamId: 'B',
            bowlingTeamId: 'A',
            status: 'COMPLETED',
            winnerId: 'B',
            currentInnings: 2,
            totalRuns: 91,
            totalBalls: 60,
            innings1Data: {
                runs: 90,
                wickets: 5,
                balls: 60,
                teamId: 'A',
                wicketHistory: [],
                wideCount: 0,
                noBallCount: 0,
                byeCount: 0,
                legByeCount: 0,
                recordedBallsCount: 60,
                durationMinutes: 0,
                battingOrder: []
            }
        };
        const m2 = {
            ...baseMatch,
            id: 'm2',
            teamA: teams[0],
            teamB: teams[2],
            battingTeamId: 'A',
            bowlingTeamId: 'C',
            status: 'COMPLETED',
            winnerId: 'A',
            currentInnings: 2,
            totalRuns: 75,
            totalBalls: 60,
            innings1Data: {
                runs: 100,
                wickets: 4,
                balls: 60,
                teamId: 'C',
                wicketHistory: [],
                wideCount: 0,
                noBallCount: 0,
                byeCount: 0,
                legByeCount: 0,
                recordedBallsCount: 60,
                durationMinutes: 0,
                battingOrder: []
            }
        };
        const table = ScoringEngine.calculatePointsTable(teams, [m1, m2]);
        assert.equal(table[0].teamId, 'B');
        assert.equal(table[0].points, 2);
        assert.equal(table[1].teamId, 'A');
        assert.equal(table[1].points, 2);
        assert.equal(parseFloat(table[0].nrr) > parseFloat(table[1].nrr), true);
    });
    test('Points table handles missing innings snapshots without crashing and keeps base points', () => {
        const teams = [
            { ...teamA, id: 'A', name: 'Team A' },
            { ...teamB, id: 'B', name: 'Team B' }
        ];
        const legacyCompleted = {
            ...baseMatch,
            id: 'legacy1',
            teamA: teams[0],
            teamB: teams[1],
            status: 'COMPLETED',
            winnerId: 'A',
            // Intentionally missing innings1Data to simulate legacy persisted data.
            innings1Data: null,
            currentInnings: 2,
            totalRuns: 50,
            totalBalls: 30
        };
        const table = ScoringEngine.calculatePointsTable(teams, [legacyCompleted]);
        const rowA = table.find(r => r.teamId === 'A');
        const rowB = table.find(r => r.teamId === 'B');
        assert.equal(rowA?.points, 2);
        assert.equal(rowA?.played, 1);
        assert.equal(rowB?.points, 0);
        assert.equal(rowB?.played, 1);
        assert.equal(typeof rowA?.nrr, 'string');
        assert.equal(typeof rowB?.nrr, 'string');
    });
    test('Innings stats phase buckets follow configured powerplay and innings overs', () => {
        const balls = Array.from({ length: 40 }, (_, idx) => ({
            runs: 1,
            extrasType: 'NONE',
            isLegalBall: true,
            wicketType: idx === 4 || idx === 19 || idx === 34 ? 'BOWLED' : 'NONE',
            strikerId: 'p1',
            nonStrikerId: 'p2',
            bowlerId: 'b1'
        }));
        const stats = ScoringEngine.calculateInningsStats(balls, {
            powerplayOvers: 2,
            oversPerInnings: 10
        });
        // 10-over match -> death starts at over 6 (ball 31). With 40 balls:
        // PP: first 12 balls, Mid: next 18 balls, Death: remaining 10 balls.
        assert.equal(stats.ppRuns, 12);
        assert.equal(stats.midRuns, 18);
        assert.equal(stats.finRuns, 10);
        assert.equal(stats.ppWickets, 1);
        assert.equal(stats.midWickets, 1);
        assert.equal(stats.finWickets, 1);
        assert.equal(stats.hasMid, true);
        assert.equal(stats.hasFin, true);
    });
});
