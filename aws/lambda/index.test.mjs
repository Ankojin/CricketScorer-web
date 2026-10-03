import assert from 'node:assert/strict';
import { test, describe, beforeEach } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Setup Mock Environment Variables BEFORE importing index.mjs
const TEST_JWT_SECRET = 'test_jwt_secret_key_64_bytes_long_mock_secret_string_1234567890_abcdef';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.TABLE_NAME = 'CricMatches';
process.env.ENFORCE_EMAIL_DOMAIN_DNS = 'false';

// In-Memory DynamoDB Mock Store
const mockDb = new Map();
let readBarrier = null;

function assertPutCondition(command, current) {
  const input = command.input || {};
  if (!input.ConditionExpression) return;

  const names = input.ExpressionAttributeNames || {};
  const values = input.ExpressionAttributeValues || {};
  const conditions = input.ConditionExpression.split(/\s+AND\s+/);
  const satisfied = conditions.every(condition => {
    const missing = condition.match(/^attribute_not_exists\((#[A-Za-z0-9_]+)\)$/);
    if (missing) {
      const attribute = names[missing[1]];
      return current?.[attribute] === undefined || current?.[attribute] === null;
    }

    const equal = condition.match(/^(#[A-Za-z0-9_]+)\s*=\s*(:[A-Za-z0-9_]+)$/);
    if (equal) {
      return current?.[names[equal[1]]] === values[equal[2]];
    }
    throw new Error(`Unsupported mocked condition: ${condition}`);
  });

  if (!satisfied) {
    const error = new Error('The conditional request failed');
    error.name = 'ConditionalCheckFailedException';
    throw error;
  }
}

// Mock AWS SDK DynamoDB Document Client
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

DynamoDBDocumentClient.prototype.send = async function (command) {
  const name = command.constructor?.name || command.name;

  if (name === 'GetCommand') {
    const key = command.input?.Key?.matchId;
    const item = mockDb.get(key);
    const snapshot = item ? JSON.parse(JSON.stringify(item)) : undefined;
    if (readBarrier && readBarrier.matchId === key) {
      readBarrier.reads++;
      if (readBarrier.reads === readBarrier.targetReads) readBarrier.release();
      await readBarrier.promise;
    }
    return { Item: snapshot };
  }

  if (name === 'PutCommand') {
    const item = command.input?.Item;
    if (item && item.matchId) {
      assertPutCondition(command, mockDb.get(item.matchId));
      mockDb.set(item.matchId, JSON.parse(JSON.stringify(item)));
    }
    return {};
  }

  if (name === 'ScanCommand') {
    const items = Array.from(mockDb.values()).map(it => JSON.parse(JSON.stringify(it)));
    return { Items: items };
  }

  if (name === 'DeleteCommand') {
    const key = command.input?.Key?.matchId;
    if (key) {
      mockDb.delete(key);
    }
    return {};
  }

  return {};
};

// Import Handler after SDK patching
const { handler, legacyHash } = await import('./index.mjs');

// Helper to construct Lambda API Gateway HTTP API v2 Event
function createEvent(method, path, body = null, token = null, pathParams = {}, query = {}) {
  const headers = {
    'content-type': 'application/json'
  };
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }
  headers['x-client-platform'] = 'android';

  return {
    requestContext: {
      http: { method }
    },
    rawPath: path,
    path,
    pathParameters: pathParams,
    queryStringParameters: query,
    headers,
    body: body ? JSON.stringify(body) : null
  };
}

function createToken(userId = 'user_123') {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

describe('Lambda API Handler & Security Tests', () => {

  beforeEach(() => {
    mockDb.clear();
  });

  test('1. Registering a user hashes the password with bcrypt', async () => {
    const event = createEvent('POST', '/auth/register', {
      email: 'alice@nrkmart.in',
      password: 'MySecretPassword123',
      name: 'Alice'
    });

    const res = await handler(event);
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body);
    assert.ok(body.token);
    assert.equal(body.user.email, 'alice@nrkmart.in');

    // Verify stored user item
    const userId = body.user.userId;
    const storedItem = mockDb.get(userId);
    assert.ok(storedItem);
    assert.equal(storedItem.docType, 'USER');

    const storedHash = storedItem.passwordHash;
    assert.notEqual(storedHash, 'MySecretPassword123');
    assert.ok(storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$'));
    assert.ok(await bcrypt.compare('MySecretPassword123', storedHash));
  });

  test('2. Logging in with correct password succeeds and returns a real JWT', async () => {
    // Register Alice
    const regEvent = createEvent('POST', '/auth/register', {
      email: 'bob@nrkmart.in',
      password: 'BobSecurePassword123!',
      name: 'Bob'
    });
    await handler(regEvent);

    // Login Bob
    const loginEvent = createEvent('POST', '/auth/login', {
      email: 'bob@nrkmart.in',
      password: 'BobSecurePassword123!'
    });

    const res = await handler(loginEvent);
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body);
    assert.ok(body.token);

    // Verify JWT Token
    const decoded = jwt.verify(body.token, TEST_JWT_SECRET);
    assert.ok(decoded.userId);
    assert.equal(decoded.userId, body.user.userId);
  });

  test('3. Logging in with wrong password returns 401', async () => {
    const regEvent = createEvent('POST', '/auth/register', {
      email: 'charlie@nrkmart.in',
      password: 'CorrectPassword'
    });
    await handler(regEvent);

    const loginEvent = createEvent('POST', '/auth/login', {
      email: 'charlie@nrkmart.in',
      password: 'WrongPassword'
    });

    const res = await handler(loginEvent);
    assert.equal(res.statusCode, 401);

    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Invalid email or password');
  });

  test('4. Legacy user login triggers automatic lazy migration to bcrypt hash', async () => {
    // Seed a mock legacy user with legacyHash password
    const email = 'legacy@nrkmart.in';
    const rawPassword = 'OldLegacyPassword123';
    const userId = `user_${legacyHash(email.toLowerCase())}`;
    const oldHash = legacyHash(rawPassword);

    mockDb.set(userId, {
      matchId: userId,
      docType: 'USER',
      passwordHash: oldHash,
      payload: {
        userId,
        email,
        name: 'Legacy User',
        passwordHash: oldHash
      }
    });

    // Attempt login with correct legacy password
    const loginEvent = createEvent('POST', '/auth/login', {
      email,
      password: rawPassword
    });

    const res = await handler(loginEvent);
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body);
    assert.ok(body.token);

    // Verify stored user hash was migrated to bcrypt!
    const updatedItem = mockDb.get(userId);
    assert.ok(updatedItem);

    const updatedHash = updatedItem.passwordHash;
    assert.notEqual(updatedHash, oldHash);
    assert.ok(updatedHash.startsWith('$2a$') || updatedHash.startsWith('$2b$') || updatedHash.startsWith('$2y$'));
    assert.ok(await bcrypt.compare(rawPassword, updatedHash));
  });

  test('5. Migrated legacy user login on second attempt is verified via bcrypt.compare', async () => {
    const email = 'legacy2@nrkmart.in';
    const rawPassword = 'OldLegacyPassword456';
    const userId = `user_${legacyHash(email.toLowerCase())}`;
    const oldHash = legacyHash(rawPassword);

    mockDb.set(userId, {
      matchId: userId,
      docType: 'USER',
      passwordHash: oldHash,
      payload: { userId, email, name: 'Legacy User 2', passwordHash: oldHash }
    });

    // First Login (Triggers Migration)
    await handler(createEvent('POST', '/auth/login', { email, password: rawPassword }));

    const migratedHash = mockDb.get(userId).passwordHash;
    assert.ok(migratedHash.startsWith('$2a$') || migratedHash.startsWith('$2b$') || migratedHash.startsWith('$2y$'));

    // Second Login (Uses Bcrypt Verification)
    const secondRes = await handler(createEvent('POST', '/auth/login', { email, password: rawPassword }));
    assert.equal(secondRes.statusCode, 200);

    const body = JSON.parse(secondRes.body);
    assert.ok(body.token);
  });

  test('6. Legacy user login with WRONG password returns 401 and does NOT migrate hash', async () => {
    const email = 'legacy3@nrkmart.in';
    const rawPassword = 'CorrectLegacyPassword';
    const userId = `user_${legacyHash(email.toLowerCase())}`;
    const oldHash = legacyHash(rawPassword);

    mockDb.set(userId, {
      matchId: userId,
      docType: 'USER',
      passwordHash: oldHash,
      payload: { userId, email, name: 'Legacy User 3', passwordHash: oldHash }
    });

    // Login with Wrong Password
    const res = await handler(createEvent('POST', '/auth/login', { email, password: 'WrongPassword' }));
    assert.equal(res.statusCode, 401);

    // Verify stored hash remains unmodified legacy hash
    const storedItem = mockDb.get(userId);
    assert.equal(storedItem.passwordHash, oldHash);
  });

  test('7. POST /matches without Authorization header returns 401', async () => {
    const event = createEvent('POST', '/matches', {
      teamA: { name: 'Team A', players: [] },
      teamB: { name: 'Team B', players: [] }
    });

    const res = await handler(event);
    assert.equal(res.statusCode, 401);
  });

  test('8. POST /matches with a valid JWT succeeds', async () => {
    const validToken = createToken('user_123');

    const event = createEvent('POST', '/matches', {
      id: 'match_999',
      teamA: { name: 'Team A', players: [] },
      teamB: { name: 'Team B', players: [] }
    }, validToken);

    const res = await handler(event);
    assert.equal(res.statusCode, 201);

    const body = JSON.parse(res.body);
    assert.equal(body.id, 'match_999');
    assert.equal(body.ownerUserId, 'user_123');
    assert.ok(mockDb.has('match_999'));
  });

  test('9. GET /matches/{id} where {id} is a USER record key returns 404 (Account Exposure Regression Test)', async () => {
    // Seed a mock user in DynamoDB
    const userKey = `user_${legacyHash('victim@nrkmart.in')}`;
    mockDb.set(userKey, {
      matchId: userKey,
      docType: 'USER',
      passwordHash: '$2b$12$MockHashValueWhichShouldNeverBeExposed',
      payload: {
        userId: userKey,
        email: 'victim@nrkmart.in',
        passwordHash: '$2b$12$MockHashValueWhichShouldNeverBeExposed'
      }
    });

    // Attempt to access user record via GET /matches/{userKey}
    const event = createEvent('GET', `/matches/${userKey}`, null, null, { id: userKey });
    const res = await handler(event);

    // MUST return 404 Not Found!
    assert.equal(res.statusCode, 404);

    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Match not found');
    assert.equal(body.email, undefined);
    assert.equal(body.passwordHash, undefined);
  });

  test('10. DELETE /tournaments/{id} where {id} is a USER record key returns 404 and does NOT delete user', async () => {
    const validToken = jwt.sign({ userId: 'user_attacker' }, TEST_JWT_SECRET, { expiresIn: '1h' });
    const userKey = `user_${legacyHash('target@nrkmart.in')}`;

    mockDb.set(userKey, {
      matchId: userKey,
      docType: 'USER',
      passwordHash: '$2b$12$SecretPasswordHash',
      payload: { userId: userKey, email: 'target@nrkmart.in' }
    });

    // Attacker attempts to delete user via DELETE /tournaments/{userKey}
    const event = createEvent('DELETE', `/tournaments/${userKey}`, null, validToken, { id: userKey });
    const res = await handler(event);

    assert.equal(res.statusCode, 404);

    // Verify user record was NOT deleted
    assert.ok(mockDb.has(userKey));
    assert.equal(mockDb.get(userKey).docType, 'USER');
  });

  test('10a. POST /tournaments cannot overwrite another account or document type', async () => {
    const tournamentId = 'owned_tournament';
    const existingTournament = {
      matchId: tournamentId,
      docType: 'TOURNAMENT',
      ownerUserId: 'user_owner',
      updatedAt: '2026-01-01T00:00:00.000Z',
      payload: { id: tournamentId, name: 'Owner Series', ownerUserId: 'user_owner' }
    };
    mockDb.set(tournamentId, existingTournament);

    const foreignWrite = await handler(createEvent('POST', '/tournaments', {
      id: tournamentId,
      name: 'Attacker Series'
    }, createToken('user_attacker')));
    assert.equal(foreignWrite.statusCode, 403);
    assert.equal(mockDb.get(tournamentId).payload.name, 'Owner Series');

    mockDb.set('user_collision', {
      matchId: 'user_collision',
      docType: 'USER',
      ownerUserId: 'user_owner',
      payload: { userId: 'user_collision', email: 'owner@nrkmart.in' }
    });
    const typeCollision = await handler(createEvent('POST', '/tournaments', {
      id: 'user_collision',
      name: 'Collision Series'
    }, createToken('user_owner')));
    assert.equal(typeCollision.statusCode, 404);
    assert.equal(mockDb.get('user_collision').docType, 'USER');
  });

  test('10b. Concurrent series updates cannot overwrite a newer snapshot', async () => {
    const ownerToken = createToken('user_series_race');
    const tournamentId = 'series_revision_race';
    const created = await handler(createEvent('POST', '/tournaments', {
      id: tournamentId,
      name: 'Initial Series',
      teams: []
    }, ownerToken));
    assert.equal(created.statusCode, 201);

    let release;
    const promise = new Promise(resolve => { release = resolve; });
    readBarrier = { matchId: tournamentId, reads: 0, targetReads: 2, promise, release };
    const updates = await Promise.all([
      handler(createEvent('POST', '/tournaments', {
        id: tournamentId,
        name: 'Series Update A',
        teams: []
      }, ownerToken)),
      handler(createEvent('POST', '/tournaments', {
        id: tournamentId,
        name: 'Series Update B',
        teams: []
      }, ownerToken))
    ]);
    readBarrier = null;

    assert.deepEqual(updates.map(result => result.statusCode).sort(), [200, 409]);
    assert.ok(['Series Update A', 'Series Update B'].includes(mockDb.get(tournamentId).payload.name));
  });

  test('11. Responses do NOT emit duplicate CORS headers but keep Content-Type', async () => {
    // 1. GET /matches (Protected Route)
    const validToken = createToken('user_123');
    const getRes = await handler(createEvent('GET', '/matches', null, validToken));
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.headers['Content-Type'], 'application/json');
    assert.equal(getRes.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(getRes.headers['Access-Control-Allow-Methods'], undefined);
    assert.equal(getRes.headers['Access-Control-Allow-Headers'], undefined);

    // 2. POST /matches (Mutating Route Success)
    const postRes = await handler(createEvent('POST', '/matches', {
      id: 'match_cors_test',
      teamA: { name: 'A', players: [] },
      teamB: { name: 'B', players: [] }
    }, validToken));

    assert.equal(postRes.statusCode, 201);
    assert.equal(postRes.headers['Content-Type'], 'application/json');
    assert.equal(postRes.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(postRes.headers['Access-Control-Allow-Methods'], undefined);
    assert.equal(postRes.headers['Access-Control-Allow-Headers'], undefined);

    // 3. Error Path Response (401 Unauthorized)
    const errorRes = await handler(createEvent('POST', '/matches', { id: 'test' }));
    assert.equal(errorRes.statusCode, 401);
    assert.equal(errorRes.headers['Content-Type'], 'application/json');
    assert.equal(errorRes.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(errorRes.headers['Access-Control-Allow-Methods'], undefined);
    assert.equal(errorRes.headers['Access-Control-Allow-Headers'], undefined);
  });

  test('12. GET /matches/{id} without Authorization returns 403 (protected read)', async () => {
    const matchId = 'match_spectator_123';
    mockDb.set(matchId, {
      matchId,
      docType: 'MATCH',
      ownerUserId: 'user_owner',
      payload: {
        id: matchId,
        ownerUserId: 'user_owner',
        status: 'LIVE',
        totalRuns: 14,
        totalWickets: 1,
        teamA: { name: 'Rockets', players: [] },
        teamB: { name: 'Thunder', players: [] }
      }
    });

    const event = createEvent('GET', `/matches/${matchId}`, null, null, { id: matchId });
    const res = await handler(event);

    assert.equal(res.statusCode, 403);
  });

  test('19a. Spectator reads reject inactive share metadata even if the token version matches', async () => {
    const ownerToken = createToken('user_inactive_share');
    const matchId = 'match_inactive_share';
    await handler(createEvent('POST', '/matches', { id: matchId, status: 'LIVE', revision: 1 }, ownerToken));
    const shareResponse = await handler(createEvent(
      'POST', `/matches/${matchId}/share-token`, { ttlMinutes: 60 }, ownerToken, { id: matchId }
    ));
    const share = JSON.parse(shareResponse.body);

    const item = mockDb.get(matchId);
    item.spectatorShareActive = false;
    item.payload.spectatorShareActive = false;
    mockDb.set(matchId, item);

    const spectatorResponse = await handler(createEvent(
      'GET', `/matches/${matchId}`, null, null, { id: matchId }, { st: share.spectatorToken }
    ));
    assert.equal(spectatorResponse.statusCode, 410);
  });

  test('13. Unauthenticated request CANNOT mutate match via PUT or DELETE (Spectator Mutation Protection)', async () => {
    const matchId = 'match_spectator_protected';
    mockDb.set(matchId, {
      matchId,
      docType: 'MATCH',
      payload: { id: matchId, status: 'LIVE', totalRuns: 10 }
    });

    // Attempt unauthenticated PUT
    const putEvent = createEvent('PUT', `/matches/${matchId}`, { status: 'COMPLETED', totalRuns: 999 }, null, { id: matchId });
    const putRes = await handler(putEvent);
    assert.equal(putRes.statusCode, 401);

    // Attempt unauthenticated DELETE
    const delEvent = createEvent('DELETE', `/matches/${matchId}`, null, null, { id: matchId });
    const delRes = await handler(delEvent);
    assert.equal(delRes.statusCode, 401);

    // Verify match in DB was NOT mutated or deleted
    const stored = mockDb.get(matchId);
    assert.ok(stored);
    assert.equal(stored.payload.totalRuns, 10);
  });

  test('14. GET /matches only returns records owned by the authenticated user', async () => {
    mockDb.set('match_1', {
      matchId: 'match_1',
      docType: 'MATCH',
      ownerUserId: 'user_a',
      payload: { id: 'match_1', ownerUserId: 'user_a', status: 'LIVE' }
    });
    mockDb.set('match_2', {
      matchId: 'match_2',
      docType: 'MATCH',
      ownerUserId: 'user_b',
      payload: { id: 'match_2', ownerUserId: 'user_b', status: 'LIVE' }
    });

    const res = await handler(createEvent('GET', '/matches', null, createToken('user_a')));
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.length, 1);
    assert.equal(body[0].id, 'match_1');
  });

  test('15. PUT/DELETE with non-owner token returns 403', async () => {
    const matchId = 'match_owned';
    mockDb.set(matchId, {
      matchId,
      docType: 'MATCH',
      ownerUserId: 'user_owner',
      payload: { id: matchId, ownerUserId: 'user_owner', status: 'LIVE', totalRuns: 12 }
    });

    const putRes = await handler(createEvent('PUT', `/matches/${matchId}`, { totalRuns: 88 }, createToken('user_other'), { id: matchId }));
    assert.equal(putRes.statusCode, 403);

    const delRes = await handler(createEvent('DELETE', `/matches/${matchId}`, null, createToken('user_other'), { id: matchId }));
    assert.equal(delRes.statusCode, 403);

    assert.ok(mockDb.has(matchId));
  });

  test('15a. Concurrent match writes cannot overwrite a newer revision', async () => {
    const ownerToken = createToken('user_revision_owner');
    const matchId = 'match_revision_race';
    const created = await handler(createEvent('POST', '/matches', {
      id: matchId,
      status: 'LIVE',
      revision: 1,
      totalRuns: 0
    }, ownerToken));
    assert.equal(created.statusCode, 201);

    let release;
    const promise = new Promise(resolve => { release = resolve; });
    readBarrier = { matchId, reads: 0, targetReads: 2, promise, release };
    const writes = await Promise.all([
      handler(createEvent('PUT', `/matches/${matchId}`, {
        id: matchId,
        status: 'LIVE',
        revision: 2,
        totalRuns: 11
      }, ownerToken, { id: matchId })),
      handler(createEvent('PUT', `/matches/${matchId}`, {
        id: matchId,
        status: 'LIVE',
        revision: 2,
        totalRuns: 22
      }, ownerToken, { id: matchId }))
    ]);
    readBarrier = null;

    assert.deepEqual(writes.map(result => result.statusCode).sort(), [200, 409]);
    assert.equal(mockDb.get(matchId).revision, 2);
    assert.ok([11, 22].includes(mockDb.get(matchId).payload.totalRuns));
  });

  test('16. Owner can create share token and spectator with token can read LIVE match only', async () => {
    const ownerToken = createToken('user_owner');
    const matchId = 'match_live_share';
    mockDb.set(matchId, {
      matchId,
      docType: 'MATCH',
      ownerUserId: 'user_owner',
      payload: { id: matchId, ownerUserId: 'user_owner', status: 'LIVE', totalRuns: 44 }
    });

    const shareRes = await handler(createEvent('POST', `/matches/${matchId}/share-token`, null, ownerToken, { id: matchId }));
    assert.equal(shareRes.statusCode, 200);
    const shareBody = JSON.parse(shareRes.body);
    assert.ok(shareBody.spectatorToken);

    const spectateRes = await handler(createEvent('GET', `/matches/${matchId}`, null, null, { id: matchId }, { st: shareBody.spectatorToken }));
    assert.equal(spectateRes.statusCode, 200);
    const spectateBody = JSON.parse(spectateRes.body);
    assert.equal(spectateBody.id, matchId);
    assert.equal(spectateBody.totalRuns, 44);
  });

  test('17. Spectator token is rejected for wrong match id or non-live match', async () => {
    const ownerToken = createToken('user_owner');
    const liveMatchId = 'match_live_good';
    const endedMatchId = 'match_ended';

    mockDb.set(liveMatchId, {
      matchId: liveMatchId,
      docType: 'MATCH',
      ownerUserId: 'user_owner',
      payload: { id: liveMatchId, ownerUserId: 'user_owner', status: 'LIVE' }
    });
    mockDb.set(endedMatchId, {
      matchId: endedMatchId,
      docType: 'MATCH',
      ownerUserId: 'user_owner',
      payload: { id: endedMatchId, ownerUserId: 'user_owner', status: 'COMPLETED' }
    });

    const shareRes = await handler(createEvent('POST', `/matches/${liveMatchId}/share-token`, null, ownerToken, { id: liveMatchId }));
    const token = JSON.parse(shareRes.body).spectatorToken;

    const wrongMatchRes = await handler(createEvent('GET', `/matches/other_match`, null, null, { id: 'other_match' }, { st: token }));
    assert.equal(wrongMatchRes.statusCode, 404);

    const endedShareRes = await handler(createEvent('POST', `/matches/${endedMatchId}/share-token`, null, ownerToken, { id: endedMatchId }));
    assert.equal(endedShareRes.statusCode, 400);
  });

  test('18. Generating a new share token invalidates previously generated spectator token', async () => {
    const ownerToken = createToken('user_owner');
    const matchId = 'match_rotate_tokens';
    mockDb.set(matchId, {
      matchId,
      docType: 'MATCH',
      ownerUserId: 'user_owner',
      payload: { id: matchId, ownerUserId: 'user_owner', status: 'LIVE' }
    });

    const firstShareRes = await handler(createEvent('POST', `/matches/${matchId}/share-token`, null, ownerToken, { id: matchId }));
    assert.equal(firstShareRes.statusCode, 200);
    const token1 = JSON.parse(firstShareRes.body).spectatorToken;

    const secondShareRes = await handler(createEvent('POST', `/matches/${matchId}/share-token`, null, ownerToken, { id: matchId }));
    assert.equal(secondShareRes.statusCode, 200);
    const token2 = JSON.parse(secondShareRes.body).spectatorToken;

    const oldTokenRead = await handler(createEvent('GET', `/matches/${matchId}`, null, null, { id: matchId }, { st: token1 }));
    assert.equal(oldTokenRead.statusCode, 403);

    const newTokenRead = await handler(createEvent('GET', `/matches/${matchId}`, null, null, { id: matchId }, { st: token2 }));
    assert.equal(newTokenRead.statusCode, 200);
  });

  test('19. Revoke share endpoint invalidates existing spectator token', async () => {
    const ownerToken = createToken('user_owner');
    const matchId = 'match_revoke_tokens';
    mockDb.set(matchId, {
      matchId,
      docType: 'MATCH',
      ownerUserId: 'user_owner',
      payload: { id: matchId, ownerUserId: 'user_owner', status: 'LIVE' }
    });

    const shareRes = await handler(createEvent('POST', `/matches/${matchId}/share-token`, null, ownerToken, { id: matchId }));
    assert.equal(shareRes.statusCode, 200);
    const token = JSON.parse(shareRes.body).spectatorToken;

    const revokeRes = await handler(createEvent('POST', `/matches/${matchId}/revoke-share`, null, ownerToken, { id: matchId }));
    assert.equal(revokeRes.statusCode, 200);

    const readAfterRevoke = await handler(createEvent('GET', `/matches/${matchId}`, null, null, { id: matchId }, { st: token }));
    assert.equal(readAfterRevoke.statusCode, 403);
  });

  test('20. Share token endpoint respects allowed custom TTL values', async () => {
    const ownerToken = createToken('user_owner');
    const matchId = 'match_custom_ttl';
    mockDb.set(matchId, {
      matchId,
      docType: 'MATCH',
      ownerUserId: 'user_owner',
      payload: { id: matchId, ownerUserId: 'user_owner', status: 'LIVE' }
    });

    const ttlRes = await handler(createEvent('POST', `/matches/${matchId}/share-token`, { ttlMinutes: 15 }, ownerToken, { id: matchId }));
    assert.equal(ttlRes.statusCode, 200);
    const ttlBody = JSON.parse(ttlRes.body);
    assert.equal(ttlBody.expiresInSeconds, 900);

    const fallbackRes = await handler(createEvent('POST', `/matches/${matchId}/share-token`, { ttlMinutes: 7 }, ownerToken, { id: matchId }));
    assert.equal(fallbackRes.statusCode, 200);
    const fallbackBody = JSON.parse(fallbackRes.body);
    assert.equal(fallbackBody.expiresInSeconds, 21600);
  });

  test('20a. Concurrent share creation cannot issue two tokens for one version', async () => {
    const ownerToken = createToken('user_share_race');
    const matchId = 'match_share_race';
    const created = await handler(createEvent('POST', '/matches', {
      id: matchId,
      status: 'LIVE',
      revision: 1,
      totalRuns: 0
    }, ownerToken));
    assert.equal(created.statusCode, 201);

    let release;
    const promise = new Promise(resolve => { release = resolve; });
    readBarrier = { matchId, reads: 0, targetReads: 2, promise, release };
    const shares = await Promise.all([
      handler(createEvent('POST', `/matches/${matchId}/share-token`, { ttlMinutes: 60 }, ownerToken, { id: matchId })),
      handler(createEvent('POST', `/matches/${matchId}/share-token`, { ttlMinutes: 60 }, ownerToken, { id: matchId }))
    ]);
    readBarrier = null;

    assert.deepEqual(shares.map(result => result.statusCode).sort(), [200, 409]);
    const winningShare = shares.find(result => result.statusCode === 200);
    assert.ok(JSON.parse(winningShare.body).spectatorToken);
    assert.equal(mockDb.get(matchId).spectatorTokenVersion, 1);
  });

  test('21. Non-admin user attempting /admin/users returns 403 Forbidden', async () => {
    const normalToken = createToken('user_normal');
    mockDb.set('user_normal', {
      matchId: 'user_normal',
      docType: 'USER',
      payload: { userId: 'user_normal', email: 'regular@nrkmart.in', name: 'Regular User' }
    });

    const res = await handler(createEvent('GET', '/admin/users', null, normalToken));
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Admin access required');
  });

  test('22. Admin user (ankoji@gmail.com) can access all /admin/* endpoints', async () => {
    const adminUserId = 'user_admin';
    const adminToken = createToken(adminUserId);
    mockDb.set(adminUserId, {
      matchId: adminUserId,
      docType: 'USER',
      payload: { userId: adminUserId, email: 'ankoji@gmail.com', name: 'Ankoji Admin' }
    });

    const usersRes = await handler(createEvent('GET', '/admin/users', null, adminToken));
    assert.equal(usersRes.statusCode, 200);
    const usersBody = JSON.parse(usersRes.body);
    assert.ok(Array.isArray(usersBody.users));

    const healthRes = await handler(createEvent('GET', '/admin/system-health', null, adminToken));
    assert.equal(healthRes.statusCode, 200);
    const healthBody = JSON.parse(healthRes.body);
    assert.equal(healthBody.status, 'HEALTHY');

    const authSyncRes = await handler(createEvent('GET', '/admin/auth-sync', null, adminToken));
    assert.equal(authSyncRes.statusCode, 200);

    const errorsRes = await handler(createEvent('GET', '/admin/error-dashboard', null, adminToken));
    assert.equal(errorsRes.statusCode, 200);

    const auditRes = await handler(createEvent('GET', '/admin/audit-logs', null, adminToken));
    assert.equal(auditRes.statusCode, 200);
  });

  test('23. POST /admin/error-log records client error logs with 30-day TTL', async () => {
    const res = await handler(createEvent('POST', '/admin/error-log', {
      source: 'FRONTEND',
      error: 'Uncaught TypeError in scorecard.js',
      path: '/scorecard'
    }));

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'LOGGED');
  });

  test('24. POST /matches rejects payload larger than MATCH_WRITE_MAX_BODY_BYTES', async () => {
    const prevLimit = process.env.MATCH_WRITE_MAX_BODY_BYTES;
    process.env.MATCH_WRITE_MAX_BODY_BYTES = '128';

    try {
      const validToken = createToken('user_payload_limit');
      const oversizedNote = 'x'.repeat(1024);
      const res = await handler(createEvent('POST', '/matches', {
        id: 'match_payload_oversized',
        teamA: { id: 'A1', name: 'Team A', players: [] },
        teamB: { id: 'B1', name: 'Team B', players: [] },
        note: oversizedNote
      }, validToken));

      assert.equal(res.statusCode, 413);
      const body = JSON.parse(res.body);
      assert.equal(body.code, 'MATCH_PAYLOAD_TOO_LARGE');
    } finally {
      if (prevLimit === undefined) {
        delete process.env.MATCH_WRITE_MAX_BODY_BYTES;
      } else {
        process.env.MATCH_WRITE_MAX_BODY_BYTES = prevLimit;
      }
    }
  });

  test('25. PUT /matches rejects ball or wicket history beyond configured limits', async () => {
    const prevBallLimit = process.env.MATCH_WRITE_MAX_BALL_EVENTS;
    const prevWicketLimit = process.env.MATCH_WRITE_MAX_WICKET_EVENTS;
    process.env.MATCH_WRITE_MAX_BALL_EVENTS = '2';
    process.env.MATCH_WRITE_MAX_WICKET_EVENTS = '1';

    try {
      const ownerId = 'user_limit_owner';
      const token = createToken(ownerId);
      const matchId = 'match_event_limit';

      mockDb.set(matchId, {
        matchId,
        docType: 'MATCH',
        ownerUserId: ownerId,
        updatedAt: new Date().toISOString(),
        revision: 1,
        payload: {
          id: matchId,
          ownerUserId: ownerId,
          status: 'LIVE',
          revision: 1,
          ballHistory: [],
          wicketHistory: []
        }
      });

      const res = await handler(createEvent('PUT', `/matches/${matchId}`, {
        status: 'LIVE',
        revision: 2,
        ballHistory: [{ over: 1, ball: 1 }, { over: 1, ball: 2 }, { over: 1, ball: 3 }],
        wicketHistory: [{ over: 1, ball: 3 }, { over: 2, ball: 1 }]
      }, token, { id: matchId }));

      assert.equal(res.statusCode, 422);
      const body = JSON.parse(res.body);
      assert.equal(body.code, 'MATCH_SYNC_LIMIT_EXCEEDED');
    } finally {
      if (prevBallLimit === undefined) {
        delete process.env.MATCH_WRITE_MAX_BALL_EVENTS;
      } else {
        process.env.MATCH_WRITE_MAX_BALL_EVENTS = prevBallLimit;
      }

      if (prevWicketLimit === undefined) {
        delete process.env.MATCH_WRITE_MAX_WICKET_EVENTS;
      } else {
        process.env.MATCH_WRITE_MAX_WICKET_EVENTS = prevWicketLimit;
      }
    }
  });

});
