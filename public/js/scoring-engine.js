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
        bowlingStats: { overs: 0, balls: 0, maidens: 0, runsConceded: 0, wickets: 0, dotBalls: 0, wides: 0, noBalls: 0 }
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
              noBalls: (np.bowlingStats?.noBalls || 0) + (ball.extrasType === 'NO_BALL' ? 1 : 0)
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
      lastBowlerId: match.lastBowlerId || null
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

      if (!ball.isAdjustment) {
        const victimId = ball.outPlayerId || (ball.wicketType && ball.wicketType !== 'NONE' ? ball.strikerId : null);
        if (!sId && ball.strikerId && ball.strikerId !== victimId) sId = ball.strikerId;
        if (!nsId && ball.nonStrikerId && ball.nonStrikerId !== victimId) nsId = ball.nonStrikerId;
        if (!activeBId) activeBId = ball.bowlerId;
      }

      let physicalRuns = ball.runs;
      if (ball.extrasType === 'WIDE' || ball.extrasType === 'BYE' || ball.extrasType === 'LEG_BYE') {
        physicalRuns = ball.extraRuns || 0;
      }

      const shouldRotate = physicalRuns % 2 !== 0;
      if (shouldRotate) {
        const temp = sId; sId = nsId; nsId = temp;
      }

      if (ball.wicketType && ball.wicketType !== 'NONE') {
        const victimId = ball.outPlayerId || ball.strikerId;
        if (sId === victimId) sId = null;
        else if (nsId === victimId) nsId = null;
      }

      if (ballsInOver === 6) {
        const temp = sId; sId = nsId; nsId = temp;
        current.lastBowlerId = activeBId;
        activeBId = null;
        ballsInOver = 0;
      }

      const squadSize = (battingTeam.players || []).length || 11;
      const maxWickets = Math.max(1, squadSize - 1);

      current = {
        ...current,
        strikerId: sId,
        nonStrikerId: nsId,
        currentBowlerId: activeBId
      };

      const inningsEnded = current.totalWickets >= maxWickets || current.totalBalls >= (current.oversPerInnings || 20) * 6;

      if (current.currentInnings === 1 && inningsEnded) {
        current = {
          ...current,
          currentInnings: 2,
          target: current.totalRuns + 1,
          battingTeamId: current.bowlingTeamId,
          bowlingTeamId: current.battingTeamId,
          totalRuns: 0,
          totalWickets: 0,
          totalBalls: 0,
          wicketHistory: [],
          strikerId: null,
          nonStrikerId: null,
          currentBowlerId: null
        };
        ballsInOver = 0;
      } else if (current.currentInnings === 2 && current.target != null && (current.totalBalls > 0 || current.totalWickets > 0)) {
        if (current.totalRuns >= current.target) {
          current = { ...current, status: 'COMPLETED', winnerId: current.battingTeamId };
        } else if (inningsEnded) {
          current = { ...current, status: 'COMPLETED', winnerId: current.totalRuns < current.target - 1 ? current.bowlingTeamId : null };
        }
      }
    }

    return current;
  }

  exports.ScoringEngine = {
    isPhysicalBall,
    recalculateMatch
  };

})(typeof exports === 'object' ? exports : window);
