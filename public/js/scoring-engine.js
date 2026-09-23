// Pure JavaScript Scoring Engine matching Android Cricket Scorer logic

(function (exports) {

  function isPhysicalBall(ball) {
    return !ball.isAdjustment &&
      ball.extrasType !== 'WIDE' &&
      ball.extrasType !== 'NO_BALL' &&
      ball.wicketType !== 'RETIRED_HURT';
  }

  function resetTeamStats(team) {
    return {
      ...team,
      players: (team.players || []).map(p => ({
        ...p,
        battingStats: { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, isRetiredHurt: false, wicketType: 'NONE' },
        bowlingStats: { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0, dotBalls: 0, wides: 0, noBalls: 0 },
        fieldingStats: { catches: 0, stumpings: 0, runOuts: 0 }
      }))
    };
  }

  function updateTeamStats(team, ball, isBat, isBowl) {
    return {
      ...team,
      players: (team.players || []).map(p => {
        let np = { ...p };
        if (isBat) {
          const outId = ball.outPlayerId || (ball.wicketType && ball.wicketType !== 'NONE' ? ball.strikerId : null);
          const isOut = p.id === outId;

          if (p.id === ball.strikerId) {
            const actualRuns = ball.runs + (ball.extrasType === 'GRANTED' ? ball.extraRuns || 0 : 0);
            const isLegal = ball.isLegalBall !== false && ball.extrasType !== 'WIDE';
            const isNoBall = ball.extrasType === 'NO_BALL';

            np = {
              ...np,
              battingStats: {
                ...np.battingStats,
                runs: (np.battingStats?.runs || 0) + actualRuns,
                balls: (np.battingStats?.balls || 0) + (isLegal || isNoBall ? 1 : 0),
                fours: (np.battingStats?.fours || 0) + (actualRuns === 4 ? 1 : 0),
                sixes: (np.battingStats?.sixes || 0) + (actualRuns === 6 ? 1 : 0),
                isOut: (np.battingStats?.isOut || false) || (isOut && ball.wicketType !== 'RETIRED_HURT'),
                isRetiredHurt: ball.wicketType === 'RETIRED_HURT',
                wicketType: isOut ? ball.wicketType || 'NONE' : (np.battingStats?.wicketType || 'NONE')
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
                  wicketType: ball.wicketType || 'NONE'
                }
              };
            }
          }
        }

        if (isBowl && p.id === ball.bowlerId) {
          const isPhysical = isPhysicalBall(ball);
          let nb = np.bowlingStats?.balls || 0;
          let no = np.bowlingStats?.overs || 0;

          if (isPhysical) {
            nb++;
            if (nb === 6) {
              no++;
              nb = 0;
            }
          }

          const runsToBowler = ball.extrasType === 'BYE' || ball.extrasType === 'LEG_BYE' ? ball.runs : ball.runs + (ball.extraRuns || 0);
          const isBowlerWicket = ball.wicketType && ball.wicketType !== 'NONE' && ball.wicketType !== 'RUN_OUT' && ball.wicketType !== 'RETIRED_HURT';

          np = {
            ...np,
            bowlingStats: {
              ...np.bowlingStats,
              runsConceded: (np.bowlingStats?.runsConceded || 0) + runsToBowler,
              balls: nb,
              overs: no,
              wickets: (np.bowlingStats?.wickets || 0) + (isBowlerWicket ? 1 : 0),
              wides: (np.bowlingStats?.wides || 0) + (ball.extrasType === 'WIDE' ? 1 : 0),
              noBalls: (np.bowlingStats?.noBalls || 0) + (ball.extrasType === 'NO_BALL' ? 1 : 0),
              dotBalls: (np.bowlingStats?.dotBalls || 0) + (ball.runs === 0 && !ball.extraRuns ? 1 : 0)
            }
          };
        }
        return np;
      })
    };
  }

  function recalculateMatch(match) {
    if (!match.tossWinnerId) {
      match.tossWinnerId = match.teamA?.id;
      match.tossDecision = 'BAT';
    }

    const teamABatsFirst = match.tossWinnerId === match.teamA?.id ? match.tossDecision === 'BAT' : match.tossDecision === 'BOWL';
    const innings1BattingTeamId = teamABatsFirst ? match.teamA?.id : match.teamB?.id;
    const innings1BowlingTeamId = innings1BattingTeamId === match.teamA?.id ? match.teamB?.id : match.teamA?.id;

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
      teamA: resetTeamStats(match.teamA || { id: 'teamA', name: 'Team A', players: [] }),
      teamB: resetTeamStats(match.teamB || { id: 'teamB', name: 'Team B', players: [] }),
      status: match.status || 'LIVE',
      currentInnings: match.currentInnings || 1,
      battingTeamId: match.currentInnings === 2 ? innings1BowlingTeamId : innings1BattingTeamId,
      bowlingTeamId: match.currentInnings === 2 ? innings1BattingTeamId : innings1BowlingTeamId,
      strikerId: match.strikerId || null,
      nonStrikerId: match.nonStrikerId || null,
      currentBowlerId: match.currentBowlerId || null,
      lastBowlerId: match.lastBowlerId || null,
      pendingAction: 'NONE'
    };

    let ballsInOver = 0;
    const history = match.ballHistory || [];

    for (let i = 0; i < history.length; i++) {
      const ball = history[i];
      if (current.status === 'COMPLETED') break;

      const isBattingA = current.battingTeamId === current.teamA.id;
      const battingTeam = isBattingA ? current.teamA : current.teamB;
      const bowlingTeam = isBattingA ? current.teamB : current.teamA;

      const isPhysical = isPhysicalBall(ball);
      const isRealWicket = ball.wicketType && ball.wicketType !== 'NONE' && ball.wicketType !== 'RETIRED_HURT';

      current = {
        ...current,
        totalRuns: current.totalRuns + ball.runs + (ball.extraRuns || 0),
        totalWickets: current.totalWickets + (isRealWicket ? 1 : 0),
        totalBalls: current.totalBalls + (isPhysical ? 1 : 0),
        wideCount: current.wideCount + (ball.extrasType === 'WIDE' ? ball.extraRuns || 0 : 0),
        noBallCount: current.noBallCount + (ball.extrasType === 'NO_BALL' ? ball.extraRuns || 0 : 0),
        byeCount: current.byeCount + (ball.extrasType === 'BYE' ? ball.extraRuns || 0 : 0),
        legByeCount: current.legByeCount + (ball.extrasType === 'LEG_BYE' ? ball.extraRuns || 0 : 0),
        teamA: updateTeamStats(current.teamA, ball, isBattingA, !isBattingA),
        teamB: updateTeamStats(current.teamB, ball, !isBattingA, isBattingA),
        ballHistory: history.slice(0, i + 1)
      };

      if (isRealWicket) {
        const outId = ball.outPlayerId || ball.strikerId;
        const outName = (battingTeam.players || []).find(p => p.id === outId)?.name || 'Unknown';
        const overStr = `${Math.floor(current.totalBalls / 6)}.${current.totalBalls % 6}`;

        current.wicketHistory.push({
          wicketNumber: current.totalWickets,
          batterName: outName,
          totalRuns: current.totalRuns,
          over: overStr,
          wicketType: ball.wicketType || 'NONE'
        });
      }

      if (isPhysical) ballsInOver++;

      let sId = current.strikerId;
      let nsId = current.nonStrikerId;
      let activeBId = current.currentBowlerId;
      let lbId = current.lastBowlerId;

      if (!ball.isAdjustment) {
        const victimId = ball.outPlayerId || (ball.wicketType && ball.wicketType !== 'NONE' ? ball.strikerId : null);
        if (!sId && ball.strikerId && ball.strikerId !== victimId) sId = ball.strikerId;
        if (!nsId && ball.nonStrikerId && ball.nonStrikerId !== victimId) nsId = ball.nonStrikerId;
        if (!activeBId) activeBId = ball.bowlerId;
      }

      if (ball.isAdjustment) {
        switch (ball.adjustmentSlot) {
          case 'STRIKER':
            if (!sId || ball.isReplacement) sId = ball.adjustmentPlayerId;
            break;
          case 'NON_STRIKER':
            if (!nsId || ball.isReplacement) nsId = ball.adjustmentPlayerId;
            break;
          case 'BOWLER':
            if (!activeBId || ball.isReplacement) activeBId = ball.adjustmentPlayerId;
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
      if (ball.extrasType === 'WIDE') {
        physicalRuns = current.gullyRules?.noExtraRunsForWidesNoBalls ? ball.extraRuns || 0 : Math.max(0, (ball.extraRuns || 0) - 1);
      } else if (ball.extrasType === 'BYE' || ball.extrasType === 'LEG_BYE') {
        physicalRuns = ball.extraRuns || 0;
      } else {
        physicalRuns = ball.runs + (ball.extrasType === 'GRANTED' ? ball.extraRuns || 0 : 0);
      }

      const shouldRotate = physicalRuns % 2 !== 0 !== Boolean(ball.hadCrossed) && ball.rotateStrike !== false && ball.extrasType !== 'GRANTED';
      if (shouldRotate) {
        const temp = sId; sId = nsId; nsId = temp;
      }

      if (ball.wicketType && ball.wicketType !== 'NONE') {
        const victimId = ball.outPlayerId || ball.strikerId;
        if (ball.wicketType === 'CAUGHT') {
          sId = null;
        } else {
          if (sId === victimId) sId = null;
          else if (nsId === victimId) nsId = null;
        }
      }

      let overJustFinished = false;
      if (ballsInOver === 6) {
        const temp = sId; sId = nsId; nsId = temp;
        lbId = activeBId;
        activeBId = null;
        ballsInOver = 0;
        overJustFinished = true;
      }

      const squadSize = current.gullyRules?.unequalTeams
        ? battingTeam.players.length
        : Math.max(1, Math.min((current.teamA.players || []).length, (current.teamB.players || []).length));
      const maxWickets = current.gullyRules?.lastManStanding ? squadSize : Math.max(1, squadSize - 1);
      const needsNonStriker = current.gullyRules?.lastManStanding ? current.totalWickets < squadSize - 1 : true;

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

      const inningsEnded = current.totalWickets >= maxWickets || current.totalBalls >= (current.oversPerInnings || 20) * 6;

      if (current.currentInnings === 1 && inningsEnded) {
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
            recordedBallsCount: i + 1
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
          strikerId: null,
          nonStrikerId: null,
          currentBowlerId: null,
          lastBowlerId: null,
          pendingAction: 'START_SECOND_INNINGS'
        };
        ballsInOver = 0;
      } else if (current.currentInnings === 2 && current.status === 'LIVE' && current.target != null && (current.totalBalls > 0 || current.totalWickets > 0)) {
        if (current.totalRuns >= current.target) {
          current = { ...current, status: 'COMPLETED', winnerId: current.battingTeamId };
        } else if (inningsEnded) {
          current = { ...current, status: 'COMPLETED', winnerId: current.totalRuns < current.target - 1 ? current.bowlingTeamId : null };
        }
      }
    }

    if (current.status === 'LIVE') {
      const batTeam = current.battingTeamId === current.teamA?.id ? current.teamA : current.teamB;
      const squadSize = current.gullyRules?.unequalTeams
        ? (batTeam.players || []).length
        : Math.max(1, Math.min((current.teamA.players || []).length, (current.teamB.players || []).length));
      const needsNonStriker = current.gullyRules?.lastManStanding ? current.totalWickets < squadSize - 1 : true;

      if (!current.strikerId) current.pendingAction = 'SELECT_STRIKER';
      else if (needsNonStriker && !current.nonStrikerId) current.pendingAction = 'SELECT_NON_STRIKER';
      else if (!current.currentBowlerId) current.pendingAction = 'SELECT_BOWLER';
    }

    return current;
  }

  function getMatchResultString(match) {
    if (!match || match.status !== 'COMPLETED') return 'Match In Progress';
    if (!match.winnerId) return 'Match Tied';

    const winner = match.winnerId === match.teamA?.id ? match.teamA : match.teamB;

    if (match.winnerId === match.battingTeamId) {
      const squadSize = (winner.players || []).length || 11;
      const maxWickets = match.gullyRules?.lastManStanding ? squadSize : Math.max(1, squadSize - 1);
      const wicketsRemaining = maxWickets - match.totalWickets;
      return `🎉 ${winner.name} won by ${wicketsRemaining} wicket${wicketsRemaining !== 1 ? 's' : ''}`;
    } else {
      const target = match.target || (match.innings1Data?.runs ? match.innings1Data.runs + 1 : 0);
      const runMargin = target - 1 - match.totalRuns;
      return `🎉 ${winner.name} won by ${runMargin} run${runMargin !== 1 ? 's' : ''}`;
    }
  }

  // ICC Standard Impact Engine for Man of the Match (MatchSummaryViews.kt parity)
  function calculateMotm(match) {
    if (!match) return null;
    const allPlayers = [...(match.teamA?.players || []), ...(match.teamB?.players || [])];
    const playerScores = {};

    allPlayers.forEach(p => {
      let score = 0;
      const b = p.battingStats || {};
      const bw = p.bowlingStats || {};
      const f = p.fieldingStats || {};

      // 1. Batting
      if (b.balls > 0) {
        score += (b.runs || 0) * 1.0;
        score += (b.fours || 0) * 1.0;
        score += (b.sixes || 0) * 2.0;

        if (b.runs >= 50) score += 20.0;
        else if (b.runs >= 30) score += 10.0;

        const sr = (b.runs / b.balls) * 100;
        if (b.balls >= 10) {
          if (sr > 200) score += 15.0;
          else if (sr > 150) score += 8.0;
        }
      }

      // 2. Bowling
      if (bw.overs > 0 || bw.balls > 0) {
        score += (bw.wickets || 0) * 25.0;
        if (bw.wickets >= 3) score += 25.0;
        else if (bw.wickets >= 2) score += 10.0;

        const totalOvers = (bw.overs || 0) + ((bw.balls || 0) / 6);
        if (totalOvers >= 1.0) {
          const eco = bw.runsConceded / totalOvers;
          if (eco < 6.0) score += 15.0;
          else if (eco < 8.0) score += 5.0;
          else if (eco > 11.0) score -= 10.0;
        }

        score += (bw.dotBalls || 0) * 1.0;
      }

      // 3. Fielding
      score += (f.catches || 0) * 10.0;
      score += (f.stumpings || 0) * 10.0;
      score += (f.runOuts || 0) * 15.0;

      // 4. Winning Bias
      const isWinner = match.winnerId != null && (
        (match.teamA?.players.some(x => x.id === p.id) && match.winnerId === match.teamA?.id) ||
        (match.teamB?.players.some(x => x.id === p.id) && match.winnerId === match.teamB?.id)
      );
      if (isWinner) score += 25.0;

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

  // ESPNcricinfo Forecaster Win Probability (MatchSummaryViews.kt parity)
  function calculateForecaster(match) {
    if (!match) return { teamAWin: 50, teamBWin: 50, projCurrent: 0, proj10: 0 };

    const totalBalls = (match.oversPerInnings || 5) * 6;
    const currentBalls = match.totalBalls || 0;
    const remainingBalls = Math.max(0, totalBalls - currentBalls);

    const crr = currentBalls > 0 ? ((match.totalRuns || 0) / currentBalls) * 6 : 0;
    const projCurrent = Math.round((match.totalRuns || 0) + (crr * (remainingBalls / 6)));
    const proj10 = Math.round((match.totalRuns || 0) + (10.0 * (remainingBalls / 6)));

    let teamAWin = 50.0;

    if (match.currentInnings === 1) {
      teamAWin = match.battingTeamId === match.teamA?.id ? (projCurrent / 160) * 100 : 100 - (projCurrent / 160) * 100;
    } else if (match.target != null) {
      const runsNeeded = match.target - match.totalRuns;
      if (remainingBalls > 0) {
        const rrr = (runsNeeded / remainingBalls) * 6;
        const wicketFactor = (10 - match.totalWickets) / 10;
        const baseProb = Math.max(0, Math.min(1, 1.0 - (rrr / 16.0)));
        teamAWin = match.battingTeamId === match.teamA?.id ? baseProb * 100 * wicketFactor : (1.0 - (baseProb * wicketFactor)) * 100;
      } else {
        teamAWin = match.totalRuns >= match.target ? (match.battingTeamId === match.teamA?.id ? 100 : 0) : (match.battingTeamId === match.teamA?.id ? 0 : 100);
      }
    }

    teamAWin = Math.max(5, Math.min(95, Math.round(teamAWin)));
    const teamBWin = 100 - teamAWin;

    return { teamAWin, teamBWin, projCurrent, proj10 };
  }

  // Calculate detailed Innings Stats
  function calculateInningsStats(balls) {
    let sR = 0, dR = 0, tR = 0, fR = 0, siR = 0, oR = 0, dots = 0, exR = 0, w = 0, wC = 0, nbC = 0;
    let ppR = 0, ppW = 0, midR = 0, midW = 0, finR = 0, finW = 0;
    let pB = 0, lB = 0;

    (balls || []).forEach(b => {
      if (b.isAdjustment) return;

      const ballTotal = (b.runs || 0) + (b.extraRuns || 0);
      const isW = b.wicketType && b.wicketType !== 'NONE' && b.wicketType !== 'RETIRED_HURT';

      if (pB < 36) { ppR += ballTotal; if (isW) ppW++; }
      else if (pB < 90) { midR += ballTotal; if (isW) midW++; }
      else { finR += ballTotal; if (isW) finW++; }

      if (isW) w++;
      if (b.extrasType && b.extrasType !== 'NONE' && b.extrasType !== 'GRANTED') exR += b.extraRuns || 0;
      if (b.extrasType === 'WIDE') wC++;
      if (b.extrasType === 'NO_BALL') nbC++;

      const runs = b.runs || 0;
      if (isPhysicalBall(b)) pB++;
      if (b.isLegalBall !== false && b.extrasType !== 'WIDE' && b.extrasType !== 'NO_BALL') lB++;

      switch (runs) {
        case 0: if (b.isLegalBall !== false && !b.extraRuns) dots++; break;
        case 1: sR += 1; break;
        case 2: dR += 2; break;
        case 3: tR += 3; break;
        case 4: fR += 4; break;
        case 6: siR += 6; break;
        default: if (runs > 0) oR += runs; break;
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
      hasMid: pB > 36,
      hasFin: pB > 90
    };
  }

  // Calculate Partnerships
  function calculatePartnerships(balls, match) {
    const partnerships = [];
    if (!balls || balls.length === 0) return partnerships;

    let currentB1Id = null, currentB2Id = null;
    let runs1 = 0, balls1 = 0, runs2 = 0, balls2 = 0, pExtras = 0;

    function recoverName(id) {
      if (!id) return "Player";
      const pA = (match.teamA?.players || []).find(p => p.id === id);
      if (pA) return pA.name;
      const pB = (match.teamB?.players || []).find(p => p.id === id);
      if (pB) return pB.name;
      return id;
    }

    (balls || []).forEach(b => {
      if (b.isAdjustment) return;

      if (!currentB1Id) {
        currentB1Id = b.strikerId;
        currentB2Id = b.nonStrikerId;
      }

      if (b.strikerId === currentB1Id) {
        runs1 += b.runs || 0;
        if (b.extrasType !== 'WIDE') balls1++;
      } else if (b.strikerId === currentB2Id) {
        runs2 += b.runs || 0;
        if (b.extrasType !== 'WIDE') balls2++;
      }

      pExtras += b.extraRuns || 0;

      if (b.wicketType && b.wicketType !== 'NONE' && b.wicketType !== 'RETIRED_HURT') {
        partnerships.push({
          batter1Name: recoverName(currentB1Id), batter1Runs: runs1, batter1Balls: balls1,
          batter2Name: recoverName(currentB2Id), batter2Runs: runs2, batter2Balls: balls2,
          totalRuns: runs1 + runs2 + pExtras, totalBalls: balls1 + balls2
        });
        currentB1Id = null; currentB2Id = null;
        runs1 = 0; balls1 = 0; runs2 = 0; balls2 = 0; pExtras = 0;
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

  // Overs Timeline Generator
  function getOverSummaries(match) {
    if (!match || !match.ballHistory) return [];

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

  // Points Table Calculator
  function calculatePointsTable(teams, matches) {
    const table = (teams || []).map(t => ({
      teamId: t.id,
      name: t.name,
      colorHex: t.colorHex || '#2196F3',
      played: 0,
      won: 0,
      lost: 0,
      tied: 0,
      points: 0,
      nrr: '0.000'
    }));

    (matches || []).forEach(m => {
      if (m.status !== 'COMPLETED') return;
      const tA = table.find(x => x.teamId === m.teamA?.id);
      const tB = table.find(x => x.teamId === m.teamB?.id);
      if (!tA || !tB) return;

      tA.played++;
      tB.played++;

      if (m.winnerId === m.teamA?.id) {
        tA.won++; tA.points += 2;
        tB.lost++;
      } else if (m.winnerId === m.teamB?.id) {
        tB.won++; tB.points += 2;
        tA.lost++;
      } else {
        tA.tied++; tA.points += 1;
        tB.tied++; tB.points += 1;
      }
    });

    return table.sort((a, b) => b.points - a.points);
  }

  exports.ScoringEngine = {
    isPhysicalBall,
    recalculateMatch,
    getOverSummaries,
    calculatePointsTable,
    getMatchResultString,
    calculateInningsStats,
    calculatePartnerships,
    calculateMotm,
    calculateForecaster
  };

})(typeof exports === 'object' ? exports : window);
