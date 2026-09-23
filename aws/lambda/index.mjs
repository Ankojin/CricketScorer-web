import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || 'CricScoreData';

// Inline Scoring Engine Logic for standalone Lambda deployment without external build bundling overhead
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
      fieldingStats: { catches: 0, runOuts: 0, stumpings: 0, droppedCatches: 0 }
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
              wicketType: isOut ? ball.wicketType || 'NONE' : (np.battingStats?.wicketType || 'NONE'),
              dismissalBowlerId: isOut && ball.wicketType !== 'RUN_OUT' && ball.wicketType !== 'RETIRED_HURT' ? ball.bowlerId : np.battingStats?.dismissalBowlerId,
              dismissalFielderId: isOut ? ball.fielderId : np.battingStats?.dismissalFielderId
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
            dotBalls: (np.bowlingStats?.dotBalls || 0) + (ball.runs === 0 && (!ball.extraRuns || ball.extraRuns === 0) ? 1 : 0),
            wides: (np.bowlingStats?.wides || 0) + (ball.extrasType === 'WIDE' ? 1 : 0),
            noBalls: (np.bowlingStats?.noBalls || 0) + (ball.extrasType === 'NO_BALL' ? 1 : 0)
          }
        };
      }
      return np;
    })
  };
}

function recalculateMatchFromHistory(match) {
  if (!match.tossWinnerId) {
    return { ...match, pendingAction: 'TOSS_REQUIRED' };
  }

  const teamABatsFirst = match.tossWinnerId === match.teamA.id ? match.tossDecision === 'BAT' : match.tossDecision === 'BOWL';
  const innings1BattingTeamId = teamABatsFirst ? match.teamA.id : match.teamB.id;
  const innings1BowlingTeamId = innings1BattingTeamId === match.teamA.id ? match.teamB.id : match.teamA.id;

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
    teamA: resetTeamStats(match.teamA),
    teamB: resetTeamStats(match.teamB),
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
      const bName = (bowlingTeam.players || []).find(p => p.id === ball.bowlerId)?.name;
      const fName = (bowlingTeam.players || []).find(p => p.id === ball.fielderId)?.name;
      const overStr = `${Math.floor(current.totalBalls / 6)}.${current.totalBalls % 6}`;

      current.wicketHistory.push({
        wicketNumber: current.totalWickets,
        batterName: `☝️ ${outName}`,
        totalRuns: current.totalRuns,
        over: overStr,
        wicketType: ball.wicketType || 'NONE',
        bowlerName: bName,
        fielderName: fName,
        dismissalReason: ball.dismissalReason
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
      lbId = activeBId; activeBId = null;
      ballsInOver = 0; overJustFinished = true;
    }

    const squadSize = current.gullyRules?.unequalTeams
      ? battingTeam.players.length
      : Math.max(1, Math.min((current.teamA.players || []).length, (current.teamB.players || []).length));
    const maxWickets = current.gullyRules?.lastManStanding ? squadSize : Math.max(1, squadSize - 1);

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

  return current;
}

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  },
  body: JSON.stringify(body)
});

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.rawPath || event.path;
  const pathParams = event.pathParameters || {};

  if (method === 'OPTIONS') {
    return response(200, { status: 'OK' });
  }

  try {
    // GET /matches
    if (method === 'GET' && path === '/matches') {
      const data = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'MATCH' }
      }));
      return response(200, data.Items || []);
    }

    // POST /matches
    if (method === 'POST' && path === '/matches') {
      const matchData = JSON.parse(event.body || '{}');
      if (!matchData.id) {
        matchData.id = 'match_' + Date.now();
      }
      const match = recalculateMatchFromHistory({
        ...matchData,
        ballHistory: matchData.ballHistory || [],
        status: matchData.status || 'UPCOMING'
      });

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: 'MATCH',
          SK: `MATCH#${match.id}`,
          ...match
        }
      }));
      return response(201, match);
    }

    // GET /matches/{matchId}
    if (method === 'GET' && pathParams.matchId) {
      const data = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: 'MATCH', SK: `MATCH#${pathParams.matchId}` }
      }));
      if (!data.Item) {
        return response(404, { error: 'Match not found' });
      }
      const match = recalculateMatchFromHistory(data.Item);
      return response(200, match);
    }

    // POST /matches/{matchId}/balls
    if (method === 'POST' && pathParams.matchId && path.endsWith('/balls')) {
      const ballData = JSON.parse(event.body || '{}');
      const data = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: 'MATCH', SK: `MATCH#${pathParams.matchId}` }
      }));

      if (!data.Item) {
        return response(404, { error: 'Match not found' });
      }

      const existingMatch = data.Item;
      const updatedHistory = [...(existingMatch.ballHistory || []), ballData];
      const recalculatedMatch = recalculateMatchFromHistory({
        ...existingMatch,
        ballHistory: updatedHistory
      });

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: 'MATCH',
          SK: `MATCH#${pathParams.matchId}`,
          ...recalculatedMatch
        }
      }));

      return response(200, recalculatedMatch);
    }

    // POST /matches/{matchId}/undo
    if (method === 'POST' && pathParams.matchId && path.endsWith('/undo')) {
      const data = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: 'MATCH', SK: `MATCH#${pathParams.matchId}` }
      }));

      if (!data.Item) {
        return response(404, { error: 'Match not found' });
      }

      const existingMatch = data.Item;
      const history = existingMatch.ballHistory || [];
      if (history.length > 0) history.pop();

      const recalculatedMatch = recalculateMatchFromHistory({
        ...existingMatch,
        ballHistory: history
      });

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: 'MATCH',
          SK: `MATCH#${pathParams.matchId}`,
          ...recalculatedMatch
        }
      }));

      return response(200, recalculatedMatch);
    }

    // DELETE /matches/{matchId}
    if (method === 'DELETE' && pathParams.matchId) {
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: 'MATCH', SK: `MATCH#${pathParams.matchId}` }
      }));
      return response(200, { message: 'Match deleted successfully' });
    }

    return response(404, { error: 'Endpoint not found' });
  } catch (err) {
    console.error('Lambda Execution Error:', err);
    return response(500, { error: err.message || 'Internal Server Error' });
  }
};
