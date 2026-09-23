import {
  Match,
  Team,
  Player,
  Ball,
  BattingStats,
  BowlingStats,
  FieldingStats,
  WicketRecord,
  InningsSummary,
  MatchStatus,
  PendingAction,
  isPhysicalBall
} from '../models/types.js';

export class ScoringEngine {

  public static createDefaultBattingStats(): BattingStats {
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

  public static createDefaultBowlingStats(): BowlingStats {
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

  public static createDefaultFieldingStats(): FieldingStats {
    return {
      catches: 0,
      runOuts: 0,
      stumpings: 0,
      droppedCatches: 0
    };
  }

  public static resetTeamStats(team: Team): Team {
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

  public static healLegacyId(id: string | null | undefined, team: Team): string | null {
    if (!id) return null;
    const isLikelyUuid = id.length >= 32 && !id.includes(' ');
    if (isLikelyUuid) return id;
    const found = (team.players || []).find(
      p => p.name.trim().toLowerCase() === id.trim().toLowerCase()
    );
    return found ? found.id : id;
  }

  public static isTeamA(idOrName: string | null | undefined, m: Match): boolean {
    if (!idOrName) return false;
    return (
      idOrName === m.teamA.id ||
      idOrName.trim().toLowerCase() === m.teamA.name.trim().toLowerCase()
    );
  }

  public static isPlayerOut(pId: string | null | undefined, m: Match): boolean {
    if (!pId) return false;
    const p = (m.teamA.players || []).find(x => x.id === pId) || (m.teamB.players || []).find(x => x.id === pId);
    return p?.battingStats?.isOut === true;
  }

  public static isPlayerUnavailable(pId: string | null | undefined, m: Match): boolean {
    if (!pId) return false;
    const p = (m.teamA.players || []).find(x => x.id === pId) || (m.teamB.players || []).find(x => x.id === pId);
    return p?.battingStats?.isOut === true || p?.battingStats?.isRetiredHurt === true;
  }

  public static recalculateMatchFromHistory(match: Match): Match {
    if (!match.tossWinnerId) {
      return {
        ...match,
        pendingAction: 'TOSS_REQUIRED'
      };
    }

    const teamABatsFirst =
      match.tossWinnerId === match.teamA.id
        ? match.tossDecision === 'BAT'
        : match.tossDecision === 'BOWL';

    const innings1BattingTeamId = teamABatsFirst ? match.teamA.id : match.teamB.id;
    const innings1BowlingTeamId =
      innings1BattingTeamId === match.teamA.id ? match.teamB.id : match.teamA.id;

    let current: Match = {
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
      teamA: this.resetTeamStats(match.teamA),
      teamB: this.resetTeamStats(match.teamB),
      status: 'LIVE',
      currentInnings: 1,
      battingTeamId: innings1BattingTeamId,
      bowlingTeamId: innings1BowlingTeamId,
      strikerId: null,
      nonStrikerId: null,
      currentBowlerId: null,
      lastBowlerId: null,
      pendingAction: 'NONE'
    };

    let ballsInOver = 0;
    const history = match.ballHistory || [];

    for (let i = 0; i < history.length; i++) {
      const ball = history[i];
      if (current.status === 'COMPLETED') break;

      const isBattingA = this.isTeamA(current.battingTeamId, current);
      const battingTeam = isBattingA ? current.teamA : current.teamB;
      const bowlingTeam = isBattingA ? current.teamB : current.teamA;

      const healedBall: Ball = {
        ...ball,
        strikerId: this.healLegacyId(ball.strikerId, battingTeam),
        nonStrikerId: this.healLegacyId(ball.nonStrikerId, battingTeam),
        bowlerId: this.healLegacyId(ball.bowlerId, bowlingTeam),
        outPlayerId: this.healLegacyId(ball.outPlayerId, battingTeam)
      };

      const newBattingOrder = [...(current.battingOrder || [])];
      if (healedBall.strikerId && !newBattingOrder.includes(healedBall.strikerId)) {
        newBattingOrder.push(healedBall.strikerId);
      }
      if (healedBall.nonStrikerId && !newBattingOrder.includes(healedBall.nonStrikerId)) {
        newBattingOrder.push(healedBall.nonStrikerId);
      }
      const outId =
        healedBall.outPlayerId ||
        (healedBall.wicketType &&
        healedBall.wicketType !== 'NONE' &&
        healedBall.wicketType !== 'RETIRED_HURT'
          ? healedBall.strikerId
          : null);
      if (outId && !newBattingOrder.includes(outId)) {
        newBattingOrder.push(outId);
      }

      const isPhysical = isPhysicalBall(healedBall);
      const isRealWicket =
        healedBall.wicketType &&
        healedBall.wicketType !== 'NONE' &&
        healedBall.wicketType !== 'RETIRED_HURT';

      current = {
        ...current,
        totalRuns: current.totalRuns + healedBall.runs + (healedBall.extraRuns || 0),
        totalWickets: current.totalWickets + (isRealWicket ? 1 : 0),
        totalBalls: current.totalBalls + (isPhysical ? 1 : 0),
        wideCount:
          current.wideCount +
          (healedBall.extrasType === 'WIDE' ? healedBall.extraRuns || 0 : 0),
        noBallCount:
          current.noBallCount +
          (healedBall.extrasType === 'NO_BALL' ? healedBall.extraRuns || 0 : 0),
        byeCount:
          current.byeCount +
          (healedBall.extrasType === 'BYE' ? healedBall.extraRuns || 0 : 0),
        legByeCount:
          current.legByeCount +
          (healedBall.extrasType === 'LEG_BYE' ? healedBall.extraRuns || 0 : 0),
        battingOrder: newBattingOrder,
        teamA: this.updateTeamStats(current.teamA, healedBall, isBattingA, !isBattingA),
        teamB: this.updateTeamStats(current.teamB, healedBall, !isBattingA, isBattingA),
        ballHistory: history.slice(0, i + 1)
      };

      if (isRealWicket) {
        const outName =
          (battingTeam.players || []).find(p => p.id === outId)?.name || 'Unknown';
        const bName = (bowlingTeam.players || []).find(p => p.id === healedBall.bowlerId)?.name;
        const fName = (bowlingTeam.players || []).find(p => p.id === healedBall.fielderId)?.name;
        const overStr = `${Math.floor(current.totalBalls / 6)}.${current.totalBalls % 6}`;

        const wicketRecord: WicketRecord = {
          wicketNumber: current.totalWickets,
          batterName: `☝️ ${outName}`,
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
        const victimId =
          healedBall.outPlayerId ||
          (healedBall.wicketType && healedBall.wicketType !== 'NONE'
            ? healedBall.strikerId
            : null);
        if (
          !sId &&
          healedBall.strikerId &&
          healedBall.strikerId !== victimId &&
          !this.isPlayerUnavailable(healedBall.strikerId, current)
        ) {
          sId = healedBall.strikerId;
        }
        if (
          !nsId &&
          healedBall.nonStrikerId &&
          healedBall.nonStrikerId !== victimId &&
          !this.isPlayerUnavailable(healedBall.nonStrikerId, current)
        ) {
          nsId = healedBall.nonStrikerId;
        }
        if (!activeBId) {
          activeBId = healedBall.bowlerId;
        }
      }

      if (healedBall.isAdjustment) {
        switch (healedBall.adjustmentSlot) {
          case 'STRIKER':
            if (!sId || healedBall.isReplacement) sId = healedBall.adjustmentPlayerId;
            break;
          case 'NON_STRIKER':
            if (!nsId || healedBall.isReplacement) nsId = healedBall.adjustmentPlayerId;
            break;
          case 'BOWLER':
            if (!activeBId || healedBall.isReplacement) activeBId = healedBall.adjustmentPlayerId;
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
      } else if (
        healedBall.extrasType === 'BYE' ||
        healedBall.extrasType === 'LEG_BYE'
      ) {
        physicalRuns = healedBall.extraRuns || 0;
      } else {
        physicalRuns =
          healedBall.runs +
          (healedBall.extrasType === 'GRANTED' ? healedBall.extraRuns || 0 : 0);
      }

      const shouldRotate =
        physicalRuns % 2 !== 0 !== Boolean(healedBall.hadCrossed) &&
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
        } else {
          if (sId === victimId) sId = null;
          else if (nsId === victimId) nsId = null;
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
        : Math.max(
            1,
            Math.min(
              (current.teamA.players || []).length,
              (current.teamB.players || []).length
            )
          );
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

      const inningsEnded =
        current.totalWickets >= maxWickets ||
        current.totalBalls >= current.oversPerInnings * 6;

      if (current.currentInnings === 1 && inningsEnded) {
        const i1EndTime = match.innings1EndTimeMillis || Date.now();
        const i1StartTime = match.startTimeMillis || i1EndTime;
        const i1Duration = Math.max(0, Math.floor((i1EndTime - i1StartTime) / 60000));

        const innings1Data: InningsSummary = {
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
          strikerId: null,
          nonStrikerId: null,
          currentBowlerId: null,
          lastBowlerId: null,
          pendingAction: match.isSecondInningsStarted
            ? 'NONE'
            : 'START_SECOND_INNINGS'
        };
        ballsInOver = 0;
      } else if (
        current.currentInnings === 2 &&
        current.status === 'LIVE' &&
        current.target !== null &&
        current.target !== undefined &&
        (current.totalBalls > 0 || current.totalWickets > 0)
      ) {
        const targetValue = current.target;
        if (current.totalRuns >= targetValue) {
          current = {
            ...current,
            status: 'COMPLETED',
            winnerId: current.battingTeamId
          };
        } else if (inningsEnded) {
          current = {
            ...current,
            status: 'COMPLETED',
            winnerId:
              current.totalRuns < targetValue - 1 ? current.bowlingTeamId : null
          };
        }
      }
    }

    if (current.status === 'LIVE') {
      const batTeam = this.isTeamA(current.battingTeamId, current)
        ? current.teamA
        : current.teamB;
      const squadSize = current.gullyRules?.unequalTeams
        ? (batTeam.players || []).length
        : Math.max(
            1,
            Math.min(
              (current.teamA.players || []).length,
              (current.teamB.players || []).length
            )
          );
      const maxWickets = current.gullyRules?.lastManStanding
        ? squadSize
        : Math.max(1, squadSize - 1);
      const needsNonStriker = current.gullyRules?.lastManStanding
        ? current.totalWickets < squadSize - 1
        : true;
      const inningsEnded =
        current.totalWickets >= maxWickets ||
        current.totalBalls >= current.oversPerInnings * 6;

      if (current.currentInnings === 1 && inningsEnded) {
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
          strikerId: null,
          nonStrikerId: null,
          currentBowlerId: null,
          lastBowlerId: null,
          pendingAction: match.isSecondInningsStarted
            ? 'NONE'
            : 'START_SECOND_INNINGS'
        };
      }

      if (
        match.pendingAction === 'SELECT_MATCH_SETTINGS' ||
        match.pendingAction === 'TOSS_REQUIRED'
      ) {
        current = { ...current, pendingAction: match.pendingAction };
      } else if (current.pendingAction === 'NONE') {
        if (!inningsEnded || current.currentInnings === 2) {
          if (!current.strikerId) {
            current = { ...current, pendingAction: 'SELECT_STRIKER' };
          } else if (needsNonStriker && !current.nonStrikerId) {
            current = { ...current, pendingAction: 'SELECT_NON_STRIKER' };
          } else if (!current.currentBowlerId) {
            current = { ...current, pendingAction: 'SELECT_BOWLER' };
          }
        }
      }
    }

    return current;
  }

  public static updateTeamStats(
    team: Team,
    ball: Ball,
    isBat: boolean,
    isBowl: boolean
  ): Team {
    return {
      ...team,
      players: (team.players || []).map(p => {
        let np: Player = { ...p };

        if (isBat) {
          const outId =
            ball.outPlayerId ||
            (ball.wicketType && ball.wicketType !== 'NONE' ? ball.strikerId : null);
          const isOut = p.id === outId;

          if (p.id === ball.strikerId) {
            const actualRuns =
              ball.runs + (ball.extrasType === 'GRANTED' ? ball.extraRuns || 0 : 0);
            const isLegal =
              ball.isLegalBall !== false && ball.extrasType !== 'WIDE';
            const isNoBall = ball.extrasType === 'NO_BALL';

            np = {
              ...np,
              battingStats: {
                ...np.battingStats,
                runs: np.battingStats.runs + actualRuns,
                balls: np.battingStats.balls + (isLegal || isNoBall ? 1 : 0),
                fours: np.battingStats.fours + (actualRuns === 4 ? 1 : 0),
                sixes: np.battingStats.sixes + (actualRuns === 6 ? 1 : 0),
                isOut:
                  np.battingStats.isOut ||
                  (isOut && ball.wicketType !== 'RETIRED_HURT'),
                isRetiredHurt: ball.wicketType === 'RETIRED_HURT',
                wicketType: isOut ? ball.wicketType || 'NONE' : np.battingStats.wicketType,
                dismissalBowlerId:
                  isOut &&
                  ball.wicketType !== 'RUN_OUT' &&
                  ball.wicketType !== 'RETIRED_HURT'
                    ? ball.bowlerId
                    : np.battingStats.dismissalBowlerId,
                dismissalFielderId: isOut
                  ? ball.fielderId
                  : np.battingStats.dismissalFielderId
              }
            };
          } else if (p.id === ball.nonStrikerId) {
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
            } else {
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

          const runsToBowler =
            ball.extrasType === 'BYE' || ball.extrasType === 'LEG_BYE'
              ? ball.runs
              : ball.runs + (ball.extraRuns || 0);

          const isBowlerWicket =
            ball.wicketType &&
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
              dotBalls:
                np.bowlingStats.dotBalls +
                (ball.runs === 0 && (!ball.extraRuns || ball.extraRuns === 0) ? 1 : 0),
              wides:
                np.bowlingStats.wides + (ball.extrasType === 'WIDE' ? 1 : 0),
              noBalls:
                np.bowlingStats.noBalls + (ball.extrasType === 'NO_BALL' ? 1 : 0)
            }
          };
        }

        if (!isBat && p.id === ball.fielderId) {
          np = {
            ...np,
            fieldingStats: {
              ...np.fieldingStats,
              catches:
                np.fieldingStats.catches +
                (ball.wicketType === 'CAUGHT' ? 1 : 0),
              runOuts:
                np.fieldingStats.runOuts +
                (ball.wicketType === 'RUN_OUT' ? 1 : 0),
              stumpings:
                np.fieldingStats.stumpings +
                (ball.wicketType === 'STUMPED' ? 1 : 0),
              droppedCatches:
                np.fieldingStats.droppedCatches + (ball.isDroppedCatch ? 1 : 0)
            }
          };
        }

        return np;
      })
    };
  }
}
