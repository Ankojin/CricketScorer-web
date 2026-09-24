import { isPhysicalBall } from '../models/types.js';
export class ScoringEngine {
    static isPhysicalBall(ball) {
        return isPhysicalBall(ball);
    }
    static createDefaultBattingStats() {
        return {
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            isOut: false,
            isRetiredHurt: false,
            wicketType: 'NONE',
            dismissalBowlerId: null,
            dismissalFielderId: null
        };
    }
    static createDefaultBowlingStats() {
        return {
            overs: 0,
            balls: 0,
            maidens: 0,
            runsConceded: 0,
            wickets: 0,
            dotBalls: 0,
            wides: 0,
            noBalls: 0
        };
    }
    static createDefaultFieldingStats() {
        return {
            catches: 0,
            runOuts: 0,
            stumpings: 0,
            droppedCatches: 0
        };
    }
    static resetTeamStats(team) {
        return {
            ...team,
            players: (team.players || []).map(p => ({
                ...p,
                battingStats: this.createDefaultBattingStats(),
                bowlingStats: this.createDefaultBowlingStats(),
                fieldingStats: this.createDefaultFieldingStats()
            }))
        };
    }
    static healLegacyId(id, team) {
        if (!id)
            return null;
        const isLikelyUuid = id.length >= 32 && !id.includes(' ');
        if (isLikelyUuid)
            return id;
        const found = (team.players || []).find(p => p.name.trim().toLowerCase() === id.trim().toLowerCase());
        return found ? found.id : id;
    }
    static isTeamA(idOrName, m) {
        if (!idOrName)
            return false;
        return (idOrName === m.teamA.id ||
            idOrName.trim().toLowerCase() === m.teamA.name.trim().toLowerCase());
    }
    static isPlayerOut(pId, m) {
        if (!pId)
            return false;
        const p = (m.teamA.players || []).find(x => x.id === pId) || (m.teamB.players || []).find(x => x.id === pId);
        return p?.battingStats?.isOut === true;
    }
    static isPlayerUnavailable(pId, m) {
        if (!pId)
            return false;
        const p = (m.teamA.players || []).find(x => x.id === pId) || (m.teamB.players || []).find(x => x.id === pId);
        return p?.battingStats?.isOut === true || p?.battingStats?.isRetiredHurt === true;
    }
    static isPlayerInTeam(id, team) {
        if (!id)
            return false;
        return (team.players || []).some(p => p.id === id);
    }
    static ensureTeamPlayer(id, team) {
        return this.isPlayerInTeam(id, team) ? id || null : null;
    }
    static recalculateMatch(match) {
        return this.recalculateMatchFromHistory(match);
    }
    static recalculateMatchFromHistory(match) {
        if (!match.tossWinnerId) {
            match.tossWinnerId = match.teamA?.id;
            match.tossDecision = 'BAT';
        }
        const teamABatsFirst = match.tossWinnerId === match.teamA.id
            ? match.tossDecision === 'BAT'
            : match.tossDecision === 'BOWL';
        const innings1BattingTeamId = teamABatsFirst ? match.teamA.id : match.teamB.id;
        const innings1BowlingTeamId = innings1BattingTeamId === match.teamA.id ? match.teamB.id : match.teamA.id;
        const history = match.ballHistory || [];
        const hasHistory = history.length > 0;
        const replayStartsInnings = hasHistory ? 1 : match.currentInnings || 1;
        let current = {
            ...match,
            totalRuns: 0,
            totalWickets: 0,
            totalBalls: 0,
            wideCount: 0,
            noBallCount: 0,
            byeCount: 0,
            legByeCount: 0,
            wicketHistory: [],
            battingOrder: [],
            teamA: this.resetTeamStats(match.teamA || { id: 'teamA', name: 'Team A', players: [] }),
            teamB: this.resetTeamStats(match.teamB || { id: 'teamB', name: 'Team B', players: [] }),
            status: match.status || 'LIVE',
            currentInnings: replayStartsInnings,
            battingTeamId: replayStartsInnings === 2 ? innings1BowlingTeamId : innings1BattingTeamId,
            bowlingTeamId: replayStartsInnings === 2 ? innings1BattingTeamId : innings1BowlingTeamId,
            strikerId: hasHistory ? null : match.strikerId || null,
            nonStrikerId: hasHistory ? null : match.nonStrikerId || null,
            currentBowlerId: hasHistory ? null : match.currentBowlerId || null,
            lastBowlerId: hasHistory ? null : match.lastBowlerId || null,
            pendingAction: 'NONE'
        };
        let ballsInOver = 0;
        for (let i = 0; i < history.length; i++) {
            const ball = history[i];
            if (current.status === 'COMPLETED')
                break;
            const isBattingA = this.isTeamA(current.battingTeamId, current);
            const battingTeam = isBattingA ? current.teamA : current.teamB;
            const bowlingTeam = isBattingA ? current.teamB : current.teamA;
            const healedBall = {
                ...ball,
                strikerId: this.healLegacyId(ball.strikerId, battingTeam),
                nonStrikerId: this.healLegacyId(ball.nonStrikerId, battingTeam),
                bowlerId: this.healLegacyId(ball.bowlerId, bowlingTeam),
                outPlayerId: this.healLegacyId(ball.outPlayerId, battingTeam),
                fielderId: this.healLegacyId(ball.fielderId, bowlingTeam)
            };
            const newBattingOrder = [...(current.battingOrder || [])];
            if (healedBall.strikerId && !newBattingOrder.includes(healedBall.strikerId)) {
                newBattingOrder.push(healedBall.strikerId);
            }
            if (healedBall.nonStrikerId && !newBattingOrder.includes(healedBall.nonStrikerId)) {
                newBattingOrder.push(healedBall.nonStrikerId);
            }
            const outId = healedBall.outPlayerId ||
                (healedBall.wicketType &&
                    healedBall.wicketType !== 'NONE' &&
                    healedBall.wicketType !== 'RETIRED_HURT'
                    ? healedBall.strikerId
                    : null);
            if (outId && !newBattingOrder.includes(outId)) {
                newBattingOrder.push(outId);
            }
            const isPhysical = isPhysicalBall(healedBall);
            const isRealWicket = healedBall.wicketType &&
                healedBall.wicketType !== 'NONE' &&
                healedBall.wicketType !== 'RETIRED_HURT';
            current = {
                ...current,
                totalRuns: current.totalRuns + healedBall.runs + (healedBall.extraRuns || 0),
                totalWickets: current.totalWickets + (isRealWicket ? 1 : 0),
                totalBalls: current.totalBalls + (isPhysical ? 1 : 0),
                wideCount: current.wideCount +
                    (healedBall.extrasType === 'WIDE' ? healedBall.extraRuns || 0 : 0),
                noBallCount: current.noBallCount +
                    (healedBall.extrasType === 'NO_BALL' ? healedBall.extraRuns || 0 : 0),
                byeCount: current.byeCount +
                    (healedBall.extrasType === 'BYE' ? healedBall.extraRuns || 0 : 0),
                legByeCount: current.legByeCount +
                    (healedBall.extrasType === 'LEG_BYE' ? healedBall.extraRuns || 0 : 0),
                battingOrder: newBattingOrder,
                teamA: this.updateTeamStats(current.teamA, healedBall, isBattingA, !isBattingA),
                teamB: this.updateTeamStats(current.teamB, healedBall, !isBattingA, isBattingA),
                ballHistory: history.slice(0, i + 1)
            };
            if (isRealWicket) {
                const outName = (battingTeam.players || []).find(p => p.id === outId)?.name || 'Unknown';
                const bName = (bowlingTeam.players || []).find(p => p.id === healedBall.bowlerId)?.name;
                const fName = (bowlingTeam.players || []).find(p => p.id === healedBall.fielderId)?.name;
                const overStr = `${Math.floor(current.totalBalls / 6)}.${current.totalBalls % 6}`;
                const wicketRecord = {
                    wicketNumber: current.totalWickets,
                    batterName: outName,
                    totalRuns: current.totalRuns,
                    over: overStr,
                    wicketType: healedBall.wicketType || 'NONE',
                    bowlerName: bName,
                    fielderName: fName,
                    dismissalReason: healedBall.dismissalReason
                };
                current = {
                    ...current,
                    wicketHistory: [...current.wicketHistory, wicketRecord]
                };
            }
            if (isPhysical) {
                ballsInOver++;
            }
            let sId = current.strikerId;
            let nsId = current.nonStrikerId;
            let activeBId = current.currentBowlerId;
            let lbId = current.lastBowlerId;
            if (!healedBall.isAdjustment) {
                const victimId = healedBall.outPlayerId ||
                    (healedBall.wicketType && healedBall.wicketType !== 'NONE'
                        ? healedBall.strikerId
                        : null);
                if (!sId &&
                    healedBall.strikerId &&
                    healedBall.strikerId !== victimId &&
                    !this.isPlayerUnavailable(healedBall.strikerId, current)) {
                    sId = healedBall.strikerId;
                }
                if (!nsId &&
                    healedBall.nonStrikerId &&
                    healedBall.nonStrikerId !== victimId &&
                    !this.isPlayerUnavailable(healedBall.nonStrikerId, current)) {
                    nsId = healedBall.nonStrikerId;
                }
                if (!activeBId) {
                    activeBId = healedBall.bowlerId;
                }
            }
            if (healedBall.isAdjustment) {
                switch (healedBall.adjustmentSlot) {
                    case 'STRIKER':
                        if (!sId || healedBall.isReplacement)
                            sId = healedBall.adjustmentPlayerId;
                        break;
                    case 'NON_STRIKER':
                        if (!nsId || healedBall.isReplacement)
                            nsId = healedBall.adjustmentPlayerId;
                        break;
                    case 'BOWLER':
                        if (!activeBId || healedBall.isReplacement)
                            activeBId = healedBall.adjustmentPlayerId;
                        break;
                    case 'SWAP': {
                        const temp = sId;
                        sId = nsId;
                        nsId = temp;
                        break;
                    }
                }
                current = {
                    ...current,
                    strikerId: sId,
                    nonStrikerId: nsId,
                    currentBowlerId: activeBId
                };
                continue;
            }
            let physicalRuns = 0;
            if (healedBall.extrasType === 'WIDE') {
                physicalRuns = current.gullyRules?.noExtraRunsForWidesNoBalls
                    ? healedBall.extraRuns || 0
                    : Math.max(0, (healedBall.extraRuns || 0) - 1);
            }
            else if (healedBall.extrasType === 'BYE' ||
                healedBall.extrasType === 'LEG_BYE') {
                physicalRuns = healedBall.extraRuns || 0;
            }
            else {
                physicalRuns =
                    healedBall.runs +
                        (healedBall.extrasType === 'GRANTED' ? healedBall.extraRuns || 0 : 0);
            }
            const shouldRotate = physicalRuns % 2 !== 0 !== Boolean(healedBall.hadCrossed) &&
                healedBall.rotateStrike !== false &&
                healedBall.extrasType !== 'GRANTED';
            if (shouldRotate) {
                const temp = sId;
                sId = nsId;
                nsId = temp;
            }
            if (healedBall.wicketType && healedBall.wicketType !== 'NONE') {
                const victimId = healedBall.outPlayerId || healedBall.strikerId;
                if (healedBall.wicketType === 'CAUGHT') {
                    sId = null;
                }
                else {
                    if (sId === victimId)
                        sId = null;
                    else if (nsId === victimId)
                        nsId = null;
                }
            }
            let overJustFinished = false;
            if (ballsInOver === 6) {
                const temp = sId;
                sId = nsId;
                nsId = temp;
                lbId = activeBId;
                activeBId = null;
                ballsInOver = 0;
                overJustFinished = true;
            }
            const squadSize = current.gullyRules?.unequalTeams
                ? battingTeam.players.length
                : Math.max(1, Math.min((current.teamA.players || []).length, (current.teamB.players || []).length));
            const maxWickets = current.gullyRules?.lastManStanding
                ? squadSize
                : Math.max(1, squadSize - 1);
            const needsNonStriker = current.gullyRules?.lastManStanding
                ? current.totalWickets < squadSize - 1
                : true;
            if (!sId && nsId && !needsNonStriker) {
                sId = nsId;
                nsId = null;
            }
            current = {
                ...current,
                strikerId: sId,
                nonStrikerId: nsId,
                currentBowlerId: overJustFinished ? null : activeBId,
                lastBowlerId: lbId
            };
            const inningsEnded = current.totalWickets >= maxWickets ||
                current.totalBalls >= current.oversPerInnings * 6;
            if (current.currentInnings === 1 && inningsEnded) {
                const nextBattingTeam = this.isTeamA(current.bowlingTeamId, current)
                    ? current.teamA
                    : current.teamB;
                const nextBowlingTeam = this.isTeamA(current.battingTeamId, current)
                    ? current.teamA
                    : current.teamB;
                const carrySecondInningsSelections = match.currentInnings === 2 && match.isSecondInningsStarted === true;
                const presetStrikerId = carrySecondInningsSelections
                    ? this.ensureTeamPlayer(this.healLegacyId(match.strikerId, nextBattingTeam), nextBattingTeam)
                    : null;
                const presetNonStrikerId = carrySecondInningsSelections
                    ? this.ensureTeamPlayer(this.healLegacyId(match.nonStrikerId, nextBattingTeam), nextBattingTeam)
                    : null;
                const presetBowlerId = carrySecondInningsSelections
                    ? this.ensureTeamPlayer(this.healLegacyId(match.currentBowlerId, nextBowlingTeam), nextBowlingTeam)
                    : null;
                const presetLastBowlerId = carrySecondInningsSelections
                    ? this.ensureTeamPlayer(this.healLegacyId(match.lastBowlerId, nextBowlingTeam), nextBowlingTeam)
                    : null;
                const i1EndTime = match.innings1EndTimeMillis || Date.now();
                const i1StartTime = match.startTimeMillis || i1EndTime;
                const i1Duration = Math.max(0, Math.floor((i1EndTime - i1StartTime) / 60000));
                const innings1Data = {
                    runs: current.totalRuns,
                    wickets: current.totalWickets,
                    balls: current.totalBalls,
                    teamId: current.battingTeamId,
                    wicketHistory: current.wicketHistory,
                    wideCount: current.wideCount,
                    noBallCount: current.noBallCount,
                    byeCount: current.byeCount,
                    legByeCount: current.legByeCount,
                    recordedBallsCount: i + 1,
                    durationMinutes: i1Duration,
                    battingOrder: current.battingOrder
                };
                current = {
                    ...current,
                    innings1Data,
                    currentInnings: 2,
                    target: current.totalRuns + 1,
                    battingTeamId: current.bowlingTeamId,
                    bowlingTeamId: current.battingTeamId,
                    totalRuns: 0,
                    totalWickets: 0,
                    totalBalls: 0,
                    wideCount: 0,
                    noBallCount: 0,
                    byeCount: 0,
                    legByeCount: 0,
                    wicketHistory: [],
                    battingOrder: [],
                    strikerId: presetStrikerId,
                    nonStrikerId: presetNonStrikerId && presetNonStrikerId !== presetStrikerId
                        ? presetNonStrikerId
                        : null,
                    currentBowlerId: presetBowlerId,
                    lastBowlerId: presetLastBowlerId,
                    pendingAction: match.isSecondInningsStarted
                        ? 'NONE'
                        : 'START_SECOND_INNINGS'
                };
                ballsInOver = 0;
            }
            else if (current.currentInnings === 2 &&
                current.status === 'LIVE' &&
                current.target !== null &&
                current.target !== undefined &&
                (current.totalBalls > 0 || current.totalWickets > 0)) {
                const targetValue = current.target;
                if (current.totalRuns >= targetValue) {
                    current = {
                        ...current,
                        status: 'COMPLETED',
                        winnerId: current.battingTeamId
                    };
                }
                else if (inningsEnded) {
                    current = {
                        ...current,
                        status: 'COMPLETED',
                        winnerId: current.totalRuns < targetValue - 1 ? current.bowlingTeamId : null
                    };
                }
            }
        }
        if (current.status === 'LIVE') {
            const currentBattingTeam = this.isTeamA(current.battingTeamId, current)
                ? current.teamA
                : current.teamB;
            const currentBowlingTeam = this.isTeamA(current.bowlingTeamId, current)
                ? current.teamA
                : current.teamB;
            const safeStrikerId = this.ensureTeamPlayer(current.strikerId, currentBattingTeam);
            const safeNonStrikerRaw = this.ensureTeamPlayer(current.nonStrikerId, currentBattingTeam);
            const safeNonStrikerId = safeNonStrikerRaw && safeNonStrikerRaw !== safeStrikerId ? safeNonStrikerRaw : null;
            current = {
                ...current,
                strikerId: safeStrikerId,
                nonStrikerId: safeNonStrikerId,
                currentBowlerId: this.ensureTeamPlayer(current.currentBowlerId, currentBowlingTeam),
                lastBowlerId: this.ensureTeamPlayer(current.lastBowlerId, currentBowlingTeam)
            };
            const batTeam = this.isTeamA(current.battingTeamId, current)
                ? current.teamA
                : current.teamB;
            const squadSize = current.gullyRules?.unequalTeams
                ? (batTeam.players || []).length
                : Math.max(1, Math.min((current.teamA.players || []).length, (current.teamB.players || []).length));
            const maxWickets = current.gullyRules?.lastManStanding
                ? squadSize
                : Math.max(1, squadSize - 1);
            const needsNonStriker = current.gullyRules?.lastManStanding
                ? current.totalWickets < squadSize - 1
                : true;
            const inningsEnded = current.totalWickets >= maxWickets ||
                current.totalBalls >= current.oversPerInnings * 6;
            if (current.currentInnings === 1 && inningsEnded) {
                const nextBattingTeam = this.isTeamA(current.bowlingTeamId, current)
                    ? current.teamA
                    : current.teamB;
                const nextBowlingTeam = this.isTeamA(current.battingTeamId, current)
                    ? current.teamA
                    : current.teamB;
                const carrySecondInningsSelections = match.currentInnings === 2 && match.isSecondInningsStarted === true;
                const presetStrikerId = carrySecondInningsSelections
                    ? this.ensureTeamPlayer(this.healLegacyId(match.strikerId, nextBattingTeam), nextBattingTeam)
                    : null;
                const presetNonStrikerId = carrySecondInningsSelections
                    ? this.ensureTeamPlayer(this.healLegacyId(match.nonStrikerId, nextBattingTeam), nextBattingTeam)
                    : null;
                const presetBowlerId = carrySecondInningsSelections
                    ? this.ensureTeamPlayer(this.healLegacyId(match.currentBowlerId, nextBowlingTeam), nextBowlingTeam)
                    : null;
                const presetLastBowlerId = carrySecondInningsSelections
                    ? this.ensureTeamPlayer(this.healLegacyId(match.lastBowlerId, nextBowlingTeam), nextBowlingTeam)
                    : null;
                const i1EndTime = match.innings1EndTimeMillis || Date.now();
                const i1StartTime = match.startTimeMillis || i1EndTime;
                const i1Duration = Math.max(0, Math.floor((i1EndTime - i1StartTime) / 60000));
                current = {
                    ...current,
                    innings1Data: {
                        runs: current.totalRuns,
                        wickets: current.totalWickets,
                        balls: current.totalBalls,
                        teamId: current.battingTeamId,
                        wicketHistory: current.wicketHistory,
                        wideCount: current.wideCount,
                        noBallCount: current.noBallCount,
                        byeCount: current.byeCount,
                        legByeCount: current.legByeCount,
                        recordedBallsCount: history.length,
                        durationMinutes: i1Duration,
                        battingOrder: current.battingOrder
                    },
                    currentInnings: 2,
                    target: current.totalRuns + 1,
                    battingTeamId: current.bowlingTeamId,
                    bowlingTeamId: current.battingTeamId,
                    totalRuns: 0,
                    totalWickets: 0,
                    totalBalls: 0,
                    wideCount: 0,
                    noBallCount: 0,
                    byeCount: 0,
                    legByeCount: 0,
                    wicketHistory: [],
                    battingOrder: [],
                    strikerId: presetStrikerId,
                    nonStrikerId: presetNonStrikerId && presetNonStrikerId !== presetStrikerId
                        ? presetNonStrikerId
                        : null,
                    currentBowlerId: presetBowlerId,
                    lastBowlerId: presetLastBowlerId,
                    pendingAction: match.isSecondInningsStarted
                        ? 'NONE'
                        : 'START_SECOND_INNINGS'
                };
            }
            const preservedPendingActions = [
                'SELECT_MATCH_SETTINGS',
                'TOSS_REQUIRED',
                'SELECT_FIELDER',
                'SELECT_RUNS_WICKET',
                'SELECT_FIELDER_DROPPED_CATCH',
                'SELECT_RUNS_DROPPED_CATCH',
                'REPLACE_STRIKER',
                'REPLACE_NON_STRIKER',
                'REPLACE_BOWLER'
            ];
            if (preservedPendingActions.includes(match.pendingAction)) {
                current = { ...current, pendingAction: match.pendingAction };
            }
            else if (current.pendingAction === 'NONE' ||
                current.pendingAction === 'START_SECOND_INNINGS') {
                if (current.currentInnings === 2 &&
                    !match.isSecondInningsStarted &&
                    current.pendingAction === 'START_SECOND_INNINGS') {
                    current = { ...current, pendingAction: 'START_SECOND_INNINGS' };
                }
                else if (!inningsEnded || current.currentInnings === 2) {
                    if (!current.strikerId) {
                        current = { ...current, pendingAction: 'SELECT_STRIKER' };
                    }
                    else if (needsNonStriker && !current.nonStrikerId) {
                        current = { ...current, pendingAction: 'SELECT_NON_STRIKER' };
                    }
                    else if (!current.currentBowlerId) {
                        current = { ...current, pendingAction: 'SELECT_BOWLER' };
                    }
                    else {
                        current = { ...current, pendingAction: 'NONE' };
                    }
                }
            }
        }
        return current;
    }
    static getMatchResultString(match) {
        if (!match || match.status !== 'COMPLETED')
            return 'Match In Progress';
        if (!match.winnerId)
            return 'Match Tied';
        const winner = match.winnerId === match.teamA?.id ? match.teamA : match.teamB;
        if (match.winnerId === match.battingTeamId) {
            const squadSize = (winner.players || []).length || 11;
            const maxWickets = match.gullyRules?.lastManStanding ? squadSize : Math.max(1, squadSize - 1);
            const wicketsRemaining = maxWickets - match.totalWickets;
            return `🎉 ${winner.name} won by ${wicketsRemaining} wicket${wicketsRemaining !== 1 ? 's' : ''}`;
        }
        else {
            const target = match.target || (match.innings1Data?.runs ? match.innings1Data.runs + 1 : 0);
            const runMargin = target - 1 - match.totalRuns;
            return `🎉 ${winner.name} won by ${runMargin} run${runMargin !== 1 ? 's' : ''}`;
        }
    }
    static calculateInningsStats(balls, config) {
        let sR = 0, dR = 0, tR = 0, fR = 0, siR = 0, oR = 0, dots = 0, exR = 0, w = 0, wC = 0, nbC = 0;
        let ppR = 0, ppW = 0, midR = 0, midW = 0, finR = 0, finW = 0;
        let pB = 0, lB = 0;
        const rawInningsOvers = Number(config?.oversPerInnings || 0);
        const inningsBallsCap = rawInningsOvers > 0 ? rawInningsOvers * 6 : null;
        const defaultPowerplayBalls = 36;
        const requestedPowerplayOvers = Number(config?.powerplayOvers || 0);
        const requestedPowerplayBalls = requestedPowerplayOvers > 0 ? requestedPowerplayOvers * 6 : defaultPowerplayBalls;
        const ppBalls = inningsBallsCap != null
            ? Math.max(0, Math.min(requestedPowerplayBalls, inningsBallsCap))
            : requestedPowerplayBalls;
        const defaultDeathStartBall = 90;
        const deathStartBall = inningsBallsCap != null
            ? Math.max(ppBalls, Math.max(0, inningsBallsCap - 30))
            : defaultDeathStartBall;
        (balls || []).forEach(b => {
            if (b.isAdjustment)
                return;
            const ballTotal = (b.runs || 0) + (b.extraRuns || 0);
            const isW = b.wicketType && b.wicketType !== 'NONE' && b.wicketType !== 'RETIRED_HURT';
            if (pB < ppBalls) {
                ppR += ballTotal;
                if (isW)
                    ppW++;
            }
            else if (pB < deathStartBall) {
                midR += ballTotal;
                if (isW)
                    midW++;
            }
            else {
                finR += ballTotal;
                if (isW)
                    finW++;
            }
            if (isW)
                w++;
            if (b.extrasType && b.extrasType !== 'NONE' && b.extrasType !== 'GRANTED')
                exR += b.extraRuns || 0;
            if (b.extrasType === 'WIDE')
                wC++;
            if (b.extrasType === 'NO_BALL')
                nbC++;
            const runs = b.runs || 0;
            if (isPhysicalBall(b))
                pB++;
            if (b.isLegalBall !== false && b.extrasType !== 'WIDE' && b.extrasType !== 'NO_BALL')
                lB++;
            switch (runs) {
                case 0:
                    if (b.isLegalBall !== false && !b.extraRuns)
                        dots++;
                    break;
                case 1:
                    sR += 1;
                    break;
                case 2:
                    dR += 2;
                    break;
                case 3:
                    tR += 3;
                    break;
                case 4:
                    fR += 4;
                    break;
                case 6:
                    siR += 6;
                    break;
                default:
                    if (runs > 0)
                        oR += runs;
                    break;
            }
        });
        const dP = lB > 0 ? Math.round((dots * 100) / lB) : 0;
        return {
            singlesRuns: sR,
            doublesRuns: dR,
            triplesRuns: tR,
            foursRuns: fR,
            sixesRuns: siR,
            otherBatRuns: oR,
            dots,
            extrasRuns: exR,
            wickets: w,
            wideCount: wC,
            noBallCount: nbC,
            ppRuns: ppR,
            ppWickets: ppW,
            midRuns: midR,
            midWickets: midW,
            finRuns: finR,
            finWickets: finW,
            boundaryRuns: fR + siR,
            dotPercent: dP,
            totalLegalBalls: lB,
            hasMid: deathStartBall > ppBalls && pB > ppBalls,
            hasFin: pB > deathStartBall
        };
    }
    static calculatePartnerships(balls, match) {
        const partnerships = [];
        if (!balls || balls.length === 0)
            return partnerships;
        let currentB1Id = null, currentB2Id = null;
        let runs1 = 0, balls1 = 0, runs2 = 0, balls2 = 0, pExtras = 0;
        function recoverName(id) {
            if (!id)
                return "Player";
            const pA = (match.teamA?.players || []).find(p => p.id === id);
            if (pA)
                return pA.name;
            const pB = (match.teamB?.players || []).find(p => p.id === id);
            if (pB)
                return pB.name;
            return id;
        }
        (balls || []).forEach(b => {
            if (b.isAdjustment)
                return;
            if (!currentB1Id) {
                currentB1Id = b.strikerId || null;
                currentB2Id = b.nonStrikerId || null;
            }
            if (b.strikerId === currentB1Id) {
                runs1 += b.runs || 0;
                if (b.extrasType !== 'WIDE')
                    balls1++;
            }
            else if (b.strikerId === currentB2Id) {
                runs2 += b.runs || 0;
                if (b.extrasType !== 'WIDE')
                    balls2++;
            }
            pExtras += b.extraRuns || 0;
            if (b.wicketType && b.wicketType !== 'NONE' && b.wicketType !== 'RETIRED_HURT') {
                partnerships.push({
                    batter1Name: recoverName(currentB1Id), batter1Runs: runs1, batter1Balls: balls1,
                    batter2Name: recoverName(currentB2Id), batter2Runs: runs2, batter2Balls: balls2,
                    totalRuns: runs1 + runs2 + pExtras, totalBalls: balls1 + balls2
                });
                currentB1Id = null;
                currentB2Id = null;
                runs1 = 0;
                balls1 = 0;
                runs2 = 0;
                balls2 = 0;
                pExtras = 0;
            }
        });
        if (currentB1Id) {
            partnerships.push({
                batter1Name: recoverName(currentB1Id), batter1Runs: runs1, batter1Balls: balls1,
                batter2Name: recoverName(currentB2Id), batter2Runs: runs2, batter2Balls: balls2,
                totalRuns: runs1 + runs2 + pExtras, totalBalls: balls1 + balls2
            });
        }
        return partnerships;
    }
    static calculateMotm(match) {
        if (!match)
            return null;
        const allPlayers = [...(match.teamA?.players || []), ...(match.teamB?.players || [])];
        const playerScores = {};
        allPlayers.forEach(p => {
            let score = 0;
            const b = p.battingStats || { runs: 0, balls: 0, fours: 0, sixes: 0 };
            const bw = p.bowlingStats || { overs: 0, balls: 0, wickets: 0, runsConceded: 0, dotBalls: 0 };
            const f = p.fieldingStats || { catches: 0, stumpings: 0, runOuts: 0 };
            if (b.balls > 0) {
                score += (b.runs || 0) * 1.0;
                score += (b.fours || 0) * 1.0;
                score += (b.sixes || 0) * 2.0;
                if (b.runs >= 50)
                    score += 20.0;
                else if (b.runs >= 30)
                    score += 10.0;
                const sr = (b.runs / b.balls) * 100;
                if (b.balls >= 10) {
                    if (sr > 200)
                        score += 15.0;
                    else if (sr > 150)
                        score += 8.0;
                }
            }
            if (bw.overs > 0 || bw.balls > 0) {
                score += (bw.wickets || 0) * 25.0;
                if (bw.wickets >= 3)
                    score += 25.0;
                else if (bw.wickets >= 2)
                    score += 10.0;
                const totalOvers = (bw.overs || 0) + ((bw.balls || 0) / 6);
                if (totalOvers >= 1.0) {
                    const eco = bw.runsConceded / totalOvers;
                    if (eco < 6.0)
                        score += 15.0;
                    else if (eco < 8.0)
                        score += 5.0;
                    else if (eco > 11.0)
                        score -= 10.0;
                }
                score += (bw.dotBalls || 0) * 1.0;
            }
            score += (f.catches || 0) * 10.0;
            score += (f.stumpings || 0) * 10.0;
            score += (f.runOuts || 0) * 15.0;
            const isWinner = match.winnerId != null && ((match.teamA?.players.some(x => x.id === p.id) && match.winnerId === match.teamA?.id) ||
                (match.teamB?.players.some(x => x.id === p.id) && match.winnerId === match.teamB?.id));
            if (isWinner)
                score += 25.0;
            playerScores[p.id] = score;
        });
        let bestPlayer = null;
        let maxScore = 0;
        allPlayers.forEach(p => {
            const s = playerScores[p.id] || 0;
            if (s > maxScore) {
                maxScore = s;
                bestPlayer = p;
            }
        });
        return bestPlayer ? { player: bestPlayer, impactScore: Math.round(maxScore) } : null;
    }
    static calculateForecaster(match) {
        if (!match)
            return { teamAWin: 50, teamBWin: 50, projCurrent: 0, proj10: 0 };
        const totalBalls = (match.oversPerInnings || 5) * 6;
        const currentBalls = match.totalBalls || 0;
        const remainingBalls = Math.max(0, totalBalls - currentBalls);
        const crr = currentBalls > 0 ? ((match.totalRuns || 0) / currentBalls) * 6 : 0;
        const projCurrent = Math.round((match.totalRuns || 0) + (crr * (remainingBalls / 6)));
        const proj10 = Math.round((match.totalRuns || 0) + (10.0 * (remainingBalls / 6)));
        let teamAWin = 50.0;
        if (match.currentInnings === 1) {
            teamAWin = match.battingTeamId === match.teamA?.id ? (projCurrent / 160) * 100 : 100 - (projCurrent / 160) * 100;
        }
        else if (match.target != null) {
            const runsNeeded = match.target - match.totalRuns;
            if (remainingBalls > 0) {
                const rrr = (runsNeeded / remainingBalls) * 6;
                const wicketFactor = (10 - match.totalWickets) / 10;
                const baseProb = Math.max(0, Math.min(1, 1.0 - (rrr / 16.0)));
                teamAWin = match.battingTeamId === match.teamA?.id ? baseProb * 100 * wicketFactor : (1.0 - (baseProb * wicketFactor)) * 100;
            }
            else {
                teamAWin = match.totalRuns >= match.target ? (match.battingTeamId === match.teamA?.id ? 100 : 0) : (match.battingTeamId === match.teamA?.id ? 0 : 100);
            }
        }
        teamAWin = Math.max(5, Math.min(95, Math.round(teamAWin)));
        const teamBWin = 100 - teamAWin;
        return { teamAWin, teamBWin, projCurrent, proj10 };
    }
    static getOverSummaries(match) {
        if (!match || !match.ballHistory)
            return [];
        const overs = [];
        let currentOverBalls = [];
        let currentOverRuns = 0;
        let currentOverWickets = 0;
        let physicalCount = 0;
        let overIndex = 1;
        let accumRuns = 0;
        let accumWickets = 0;
        (match.ballHistory || []).forEach((b) => {
            const isPhysical = isPhysicalBall(b);
            const isRealWicket = b.wicketType && b.wicketType !== 'NONE' && b.wicketType !== 'RETIRED_HURT';
            const runsThisBall = b.runs + (b.extraRuns || 0);
            currentOverBalls.push(b);
            currentOverRuns += runsThisBall;
            accumRuns += runsThisBall;
            if (isRealWicket) {
                currentOverWickets++;
                accumWickets++;
            }
            if (isPhysical) {
                physicalCount++;
                if (physicalCount === 6) {
                    overs.push({
                        overNumber: overIndex,
                        runs: currentOverRuns,
                        wickets: currentOverWickets,
                        balls: [...currentOverBalls],
                        teamTotalRuns: accumRuns,
                        teamTotalWickets: accumWickets
                    });
                    overIndex++;
                    physicalCount = 0;
                    currentOverRuns = 0;
                    currentOverWickets = 0;
                    currentOverBalls = [];
                }
            }
        });
        if (currentOverBalls.length > 0) {
            overs.push({
                overNumber: overIndex,
                runs: currentOverRuns,
                wickets: currentOverWickets,
                balls: [...currentOverBalls],
                teamTotalRuns: accumRuns,
                teamTotalWickets: accumWickets,
                isPartial: true
            });
        }
        return overs;
    }
    static calculatePointsTable(teams, matches) {
        const table = (teams || []).map(t => ({
            teamId: t.id,
            name: t.name,
            colorHex: t.colorHex || '#2196F3',
            played: 0,
            won: 0,
            lost: 0,
            tied: 0,
            points: 0,
            nrr: '0.000',
            nrrValue: 0,
            runsFor: 0,
            ballsFaced: 0,
            runsAgainst: 0,
            ballsBowled: 0
        }));
        const addInningsToTeam = (teamId, runs, balls, oppRuns, oppBalls) => {
            if (!teamId)
                return;
            const row = table.find(x => x.teamId === teamId);
            if (!row)
                return;
            row.runsFor += Math.max(0, runs || 0);
            row.ballsFaced += Math.max(0, balls || 0);
            row.runsAgainst += Math.max(0, oppRuns || 0);
            row.ballsBowled += Math.max(0, oppBalls || 0);
        };
        (matches || []).forEach(m => {
            if (m.status !== 'COMPLETED')
                return;
            const tA = table.find(x => x.teamId === m.teamA?.id);
            const tB = table.find(x => x.teamId === m.teamB?.id);
            if (!tA || !tB)
                return;
            tA.played++;
            tB.played++;
            if (m.winnerId === m.teamA?.id) {
                tA.won++;
                tA.points += 2;
                tB.lost++;
            }
            else if (m.winnerId === m.teamB?.id) {
                tB.won++;
                tB.points += 2;
                tA.lost++;
            }
            else {
                tA.tied++;
                tA.points += 1;
                tB.tied++;
                tB.points += 1;
            }
            // NRR from completed innings snapshots.
            if (m.currentInnings === 2 && m.innings1Data?.teamId) {
                const innings1TeamId = m.innings1Data.teamId;
                const innings1Runs = m.innings1Data.runs || 0;
                const innings1Balls = m.innings1Data.balls || 0;
                const innings2TeamId = innings1TeamId === m.teamA?.id ? m.teamB?.id : m.teamA?.id;
                const innings2Runs = m.totalRuns || 0;
                const innings2Balls = m.totalBalls || 0;
                addInningsToTeam(innings1TeamId, innings1Runs, innings1Balls, innings2Runs, innings2Balls);
                addInningsToTeam(innings2TeamId, innings2Runs, innings2Balls, innings1Runs, innings1Balls);
            }
        });
        table.forEach(row => {
            const forOvers = row.ballsFaced > 0 ? row.ballsFaced / 6 : 0;
            const againstOvers = row.ballsBowled > 0 ? row.ballsBowled / 6 : 0;
            const forRate = forOvers > 0 ? row.runsFor / forOvers : 0;
            const againstRate = againstOvers > 0 ? row.runsAgainst / againstOvers : 0;
            row.nrrValue = forRate - againstRate;
            row.nrr = `${row.nrrValue >= 0 ? '+' : ''}${row.nrrValue.toFixed(3)}`;
        });
        return table
            .sort((a, b) => {
            if (b.points !== a.points)
                return b.points - a.points;
            if (b.nrrValue !== a.nrrValue)
                return b.nrrValue - a.nrrValue;
            if (b.won !== a.won)
                return b.won - a.won;
            return a.name.localeCompare(b.name);
        })
            .map(({ nrrValue, runsFor, ballsFaced, runsAgainst, ballsBowled, ...rest }) => rest);
    }
    static updateTeamStats(team, ball, isBat, isBowl) {
        return {
            ...team,
            players: (team.players || []).map(p => {
                let np = { ...p };
                if (isBat) {
                    const outId = ball.outPlayerId ||
                        (ball.wicketType && ball.wicketType !== 'NONE' ? ball.strikerId : null);
                    const isOut = p.id === outId;
                    if (p.id === ball.strikerId) {
                        const actualRuns = ball.runs + (ball.extrasType === 'GRANTED' ? ball.extraRuns || 0 : 0);
                        const isLegal = ball.isLegalBall !== false && ball.extrasType !== 'WIDE';
                        const isNoBall = ball.extrasType === 'NO_BALL';
                        np = {
                            ...np,
                            battingStats: {
                                ...np.battingStats,
                                runs: np.battingStats.runs + actualRuns,
                                balls: np.battingStats.balls + (isLegal || isNoBall ? 1 : 0),
                                fours: np.battingStats.fours + (actualRuns === 4 ? 1 : 0),
                                sixes: np.battingStats.sixes + (actualRuns === 6 ? 1 : 0),
                                isOut: np.battingStats.isOut ||
                                    (isOut && ball.wicketType !== 'RETIRED_HURT'),
                                isRetiredHurt: ball.wicketType === 'RETIRED_HURT',
                                wicketType: isOut ? ball.wicketType || 'NONE' : np.battingStats.wicketType,
                                dismissalBowlerId: isOut &&
                                    ball.wicketType !== 'RUN_OUT' &&
                                    ball.wicketType !== 'RETIRED_HURT'
                                    ? ball.bowlerId
                                    : np.battingStats.dismissalBowlerId,
                                dismissalFielderId: isOut
                                    ? ball.fielderId
                                    : np.battingStats.dismissalFielderId
                            }
                        };
                    }
                    else if (p.id === ball.nonStrikerId) {
                        if (isOut) {
                            np = {
                                ...np,
                                battingStats: {
                                    ...np.battingStats,
                                    isOut: ball.wicketType !== 'RETIRED_HURT',
                                    isRetiredHurt: ball.wicketType === 'RETIRED_HURT',
                                    wicketType: ball.wicketType || 'NONE',
                                    dismissalFielderId: ball.fielderId
                                }
                            };
                        }
                        else {
                            np = {
                                ...np,
                                battingStats: {
                                    ...np.battingStats,
                                    isRetiredHurt: false
                                }
                            };
                        }
                    }
                }
                if (isBowl && p.id === ball.bowlerId) {
                    const isPhysical = isPhysicalBall(ball);
                    let nb = np.bowlingStats.balls;
                    let no = np.bowlingStats.overs;
                    if (isPhysical) {
                        nb++;
                        if (nb === 6) {
                            no++;
                            nb = 0;
                        }
                    }
                    const runsToBowler = ball.extrasType === 'BYE' || ball.extrasType === 'LEG_BYE'
                        ? ball.runs
                        : ball.runs + (ball.extraRuns || 0);
                    const isBowlerWicket = ball.wicketType &&
                        ball.wicketType !== 'NONE' &&
                        ball.wicketType !== 'RUN_OUT' &&
                        ball.wicketType !== 'RETIRED_HURT';
                    np = {
                        ...np,
                        bowlingStats: {
                            ...np.bowlingStats,
                            runsConceded: np.bowlingStats.runsConceded + runsToBowler,
                            balls: nb,
                            overs: no,
                            wickets: np.bowlingStats.wickets + (isBowlerWicket ? 1 : 0),
                            dotBalls: np.bowlingStats.dotBalls +
                                (ball.runs === 0 && (!ball.extraRuns || ball.extraRuns === 0) ? 1 : 0),
                            wides: np.bowlingStats.wides + (ball.extrasType === 'WIDE' ? 1 : 0),
                            noBalls: np.bowlingStats.noBalls + (ball.extrasType === 'NO_BALL' ? 1 : 0)
                        }
                    };
                }
                if (!isBat && ball.fielderId && p.id === ball.fielderId) {
                    const fStats = np.fieldingStats || this.createDefaultFieldingStats();
                    np = {
                        ...np,
                        fieldingStats: {
                            ...fStats,
                            catches: (fStats.catches || 0) + (ball.wicketType === 'CAUGHT' ? 1 : 0),
                            runOuts: (fStats.runOuts || 0) + (ball.wicketType === 'RUN_OUT' ? 1 : 0),
                            stumpings: (fStats.stumpings || 0) + (ball.wicketType === 'STUMPED' ? 1 : 0),
                            droppedCatches: (fStats.droppedCatches || 0) + (ball.isDroppedCatch || ball.wasDroppedCatch ? 1 : 0)
                        }
                    };
                }
                return np;
            })
        };
    }
}
if (typeof window !== 'undefined') {
    window.ScoringEngine = ScoringEngine;
}
