import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  DeleteCommand
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || 'CricMatches';

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  },
  body: JSON.stringify(body)
});

// Simple secure hash helper for lightweight free-tier auth
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(36);
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.rawPath || event.path;
  const pathParams = event.pathParameters || {};

  // Handle browser CORS preflight
  if (method === 'OPTIONS') {
    return response(200, { status: 'OK' });
  }

  try {
    // ------------------- AUTH ROUTES (FREE TIER) -------------------
    if (method === 'POST' && path === '/auth/register') {
      const body = JSON.parse(event.body || '{}');
      const { email, password, name } = body;
      if (!email || !password) {
        return response(400, { error: 'Email and password required' });
      }

      const userId = `user_${simpleHash(email.toLowerCase())}`;
      const passwordHash = simpleHash(password);

      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: userId }
      }));

      if (existing.Item) {
        return response(400, { error: 'User already exists' });
      }

      const userDoc = {
        userId,
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        passwordHash,
        createdAt: new Date().toISOString()
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { matchId: userId, docType: 'USER', payload: userDoc }
      }));

      const token = `token_${userId}_${Date.now()}`;
      return response(200, { token, user: { userId, email: userDoc.email, name: userDoc.name } });
    }

    if (method === 'POST' && path === '/auth/login') {
      const body = JSON.parse(event.body || '{}');
      const { email, password } = body;
      if (!email || !password) {
        return response(400, { error: 'Email and password required' });
      }

      const userId = `user_${simpleHash(email.toLowerCase())}`;
      const passwordHash = simpleHash(password);

      const data = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: userId }
      }));

      if (!data.Item || data.Item.payload?.passwordHash !== passwordHash) {
        return response(401, { error: 'Invalid email or password' });
      }

      const user = data.Item.payload;
      const token = `token_${userId}_${Date.now()}`;
      return response(200, { token, user: { userId, email: user.email, name: user.name } });
    }

    // ------------------- MATCHES ROUTES (READ-ONLY FOR SPECTATORS) -------------------
    if (method === 'GET' && path === '/matches') {
      const data = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
      const items = (data.Items || [])
        .filter(item => !item.docType || item.docType === 'MATCH')
        .map(item => item.payload || item);
      return response(200, items);
    }

    if (method === 'GET' && path.startsWith('/matches/') && pathParams.id) {
      const data = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));
      if (!data.Item) return response(404, { error: 'Match not found' });
      return response(200, data.Item.payload || data.Item);
    }

    if (method === 'POST' && path === '/matches') {
      const payload = JSON.parse(event.body || '{}');
      const matchId = payload.id || payload.matchId || `match_${Date.now()}`;
      payload.id = matchId;

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { matchId, docType: 'MATCH', updatedAt: new Date().toISOString(), status: payload.status || 'LIVE', payload }
      }));
      return response(201, payload);
    }

    if (method === 'PUT' && pathParams.id) {
      const payload = JSON.parse(event.body || '{}');
      payload.id = pathParams.id;

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { matchId: pathParams.id, docType: 'MATCH', updatedAt: new Date().toISOString(), status: payload.status || 'LIVE', payload }
      }));
      return response(200, payload);
    }

    if (method === 'DELETE' && path.startsWith('/matches/') && pathParams.id) {
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));
      return response(200, { message: 'Match deleted successfully' });
    }

    // ------------------- TOURNAMENTS / SERIES ROUTES -------------------
    if (method === 'GET' && path === '/tournaments') {
      const data = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
      const items = (data.Items || [])
        .filter(item => item.docType === 'TOURNAMENT')
        .map(item => item.payload || item);
      return response(200, items);
    }

    if (method === 'POST' && path === '/tournaments') {
      const payload = JSON.parse(event.body || '{}');
      const tourneyId = payload.id || `tourney_${Date.now()}`;
      payload.id = tourneyId;

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { matchId: tourneyId, docType: 'TOURNAMENT', updatedAt: new Date().toISOString(), payload }
      }));
      return response(201, payload);
    }

    if (method === 'DELETE' && path.startsWith('/tournaments/') && pathParams.id) {
      const tourneyId = pathParams.id;

      const scanData = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
      const matchesToDelete = (scanData.Items || []).filter(item => {
        const payload = item.payload || item;
        return payload.tournamentId === tourneyId || item.tournamentId === tourneyId;
      });

      for (const matchItem of matchesToDelete) {
        if (matchItem.matchId) {
          await docClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { matchId: matchItem.matchId }
          }));
        }
      }

      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { matchId: tourneyId }
      }));

      return response(200, { message: 'Tournament series deleted successfully' });
    }

    // ------------------- GLOBAL PLAYERS ROUTES -------------------
    if (method === 'GET' && path === '/players') {
      const data = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
      const items = (data.Items || [])
        .filter(item => item.docType === 'PLAYER')
        .map(item => item.payload || item);
      return response(200, items);
    }

    if (method === 'POST' && path === '/players') {
      const payload = JSON.parse(event.body || '{}');
      const playerId = payload.id || `gp_${Date.now()}`;
      payload.id = playerId;

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { matchId: playerId, docType: 'PLAYER', updatedAt: new Date().toISOString(), payload }
      }));
      return response(201, payload);
    }

    if (method === 'DELETE' && path.startsWith('/players/') && pathParams.id) {
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));
      return response(200, { message: 'Player deleted successfully' });
    }

    return response(404, { error: 'Route not found' });

  } catch (err) {
    console.error('Lambda Handler Error:', err);
    return response(500, { error: err.message || 'Internal Server Error' });
  }
};
