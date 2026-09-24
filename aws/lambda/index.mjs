import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  DeleteCommand
} from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const secretsClient = new SecretsManagerClient({});

const TABLE_NAME = process.env.TABLE_NAME || 'CricMatches';
const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN;

let cachedJwtSecret = null;

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

// Legacy hash function retained ONLY for password verification during lazy migration & deterministic key derivation
export function legacyHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(36);
}

export async function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  if (cachedJwtSecret) {
    return cachedJwtSecret;
  }
  if (!JWT_SECRET_ARN) {
    throw new Error('JWT_SECRET_ARN environment variable not set');
  }

  const secretData = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: JWT_SECRET_ARN })
  );

  let secretValue = secretData.SecretString;
  try {
    const parsed = JSON.parse(secretValue);
    if (parsed && parsed.secretKey) {
      secretValue = parsed.secretKey;
    }
  } catch (e) {
    // Plain string secret
  }

  cachedJwtSecret = secretValue;
  return cachedJwtSecret;
}

export async function verifyAuthToken(event) {
  const headers = event.headers || {};
  const authHeader = headers.authorization || headers.Authorization || '';

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (!token) return null;

  try {
    const secret = await getJwtSecret();
    const decoded = jwt.verify(token, secret);
    return decoded && decoded.userId ? decoded : null;
  } catch (err) {
    return null;
  }
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
    // ------------------- AUTH ROUTES -------------------
    if (method === 'POST' && path === '/auth/register') {
      const body = JSON.parse(event.body || '{}');
      const { email, password, name } = body;
      if (!email || !password) {
        return response(400, { error: 'Email and password required' });
      }

      const emailLower = email.toLowerCase();
      const userId = `user_${legacyHash(emailLower)}`;
      const passwordHash = await bcrypt.hash(password, 12);

      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: userId }
      }));

      if (existing.Item) {
        return response(400, { error: 'User already exists' });
      }

      const userDoc = {
        userId,
        email: emailLower,
        name: name || email.split('@')[0],
        passwordHash,
        createdAt: new Date().toISOString()
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { matchId: userId, docType: 'USER', payload: userDoc, passwordHash }
      }));

      const secret = await getJwtSecret();
      const token = jwt.sign({ userId }, secret, { expiresIn: '7d' });
      return response(200, { token, user: { userId, email: userDoc.email, name: userDoc.name } });
    }

    if (method === 'POST' && path === '/auth/login') {
      const body = JSON.parse(event.body || '{}');
      const { email, password } = body;
      if (!email || !password) {
        return response(400, { error: 'Email and password required' });
      }

      const emailLower = email.toLowerCase();
      const userId = `user_${legacyHash(emailLower)}`;

      const data = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: userId }
      }));

      if (!data.Item) {
        return response(401, { error: 'Invalid email or password' });
      }

      const storedHash = data.Item.passwordHash || data.Item.payload?.passwordHash;
      if (!storedHash) {
        return response(401, { error: 'Invalid email or password' });
      }

      const isBcrypt = storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$');
      let isPasswordValid = false;
      let needsMigration = false;

      if (isBcrypt) {
        isPasswordValid = await bcrypt.compare(password, storedHash);
      } else if (storedHash.startsWith('h_')) {
        isPasswordValid = (legacyHash(password) === storedHash);
        if (isPasswordValid) {
          needsMigration = true;
        }
      }

      if (!isPasswordValid) {
        return response(401, { error: 'Invalid email or password' });
      }

      // Lazy migration: Upgrade legacy hash to bcrypt on successful login
      if (needsMigration) {
        const newBcryptHash = await bcrypt.hash(password, 12);
        const updatedPayload = { ...(data.Item.payload || {}), passwordHash: newBcryptHash };

        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...data.Item,
            passwordHash: newBcryptHash,
            payload: updatedPayload
          }
        }));
      }

      const user = data.Item.payload || data.Item;
      const secret = await getJwtSecret();
      const token = jwt.sign({ userId }, secret, { expiresIn: '7d' });
      return response(200, { token, user: { userId, email: user.email, name: user.name } });
    }

    // Helper: Enforce JWT authentication on mutating endpoints
    const enforceAuth = async () => {
      const authUser = await verifyAuthToken(event);
      if (!authUser) {
        return response(401, { error: 'Unauthorized: Valid Bearer token required' });
      }
      return authUser;
    };

    // ------------------- MATCHES ROUTES -------------------
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

      // Account exposure regression fix: Must be docType === 'MATCH' (or legacy match without docType)
      const isMatchDoc = data.Item && (!data.Item.docType || data.Item.docType === 'MATCH');
      if (!isMatchDoc) {
        return response(404, { error: 'Match not found' });
      }

      return response(200, data.Item.payload || data.Item);
    }

    if (method === 'POST' && path === '/matches') {
      const authErr = await enforceAuth();
      if (authErr.statusCode) return authErr;

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
      const authErr = await enforceAuth();
      if (authErr.statusCode) return authErr;

      // docType protection: Verify existing item is a MATCH before overwriting
      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));

      if (existing.Item && existing.Item.docType && existing.Item.docType !== 'MATCH') {
        return response(404, { error: 'Match not found' });
      }

      const payload = JSON.parse(event.body || '{}');
      payload.id = pathParams.id;

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { matchId: pathParams.id, docType: 'MATCH', updatedAt: new Date().toISOString(), status: payload.status || 'LIVE', payload }
      }));
      return response(200, payload);
    }

    if (method === 'DELETE' && path.startsWith('/matches/') && pathParams.id) {
      const authErr = await enforceAuth();
      if (authErr.statusCode) return authErr;

      // docType protection: Refuse unless item exists and is docType === 'MATCH'
      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));

      const isMatchDoc = existing.Item && (!existing.Item.docType || existing.Item.docType === 'MATCH');
      if (!isMatchDoc) {
        return response(404, { error: 'Match not found' });
      }

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
      const authErr = await enforceAuth();
      if (authErr.statusCode) return authErr;

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
      const authErr = await enforceAuth();
      if (authErr.statusCode) return authErr;

      const tourneyId = pathParams.id;

      // docType protection: Refuse unless item exists and is docType === 'TOURNAMENT'
      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: tourneyId }
      }));

      if (!existing.Item || existing.Item.docType !== 'TOURNAMENT') {
        return response(404, { error: 'Tournament not found' });
      }

      const scanData = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
      const matchesToDelete = (scanData.Items || []).filter(item => {
        const payload = item.payload || item;
        return (item.docType === 'MATCH' || !item.docType) &&
               (payload.tournamentId === tourneyId || item.tournamentId === tourneyId);
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
      const authErr = await enforceAuth();
      if (authErr.statusCode) return authErr;

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
      const authErr = await enforceAuth();
      if (authErr.statusCode) return authErr;

      // docType protection: Refuse unless item exists and is docType === 'PLAYER'
      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));

      if (!existing.Item || existing.Item.docType !== 'PLAYER') {
        return response(404, { error: 'Player not found' });
      }

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
