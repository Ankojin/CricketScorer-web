import assert from 'node:assert/strict';
import { test, describe, beforeEach } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Setup Mock Environment Variables BEFORE importing index.mjs
const TEST_JWT_SECRET = 'test_jwt_secret_key_64_bytes_long_mock_secret_string_1234567890_abcdef';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.TABLE_NAME = 'CricMatches';

// In-Memory DynamoDB Mock Store
const mockDb = new Map();

// Mock AWS SDK DynamoDB Document Client
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

DynamoDBDocumentClient.prototype.send = async function (command) {
  const name = command.constructor?.name || command.name;

  if (name === 'GetCommand') {
    const key = command.input?.Key?.matchId;
    const item = mockDb.get(key);
    return { Item: item ? JSON.parse(JSON.stringify(item)) : undefined };
  }

  if (name === 'PutCommand') {
    const item = command.input?.Item;
    if (item && item.matchId) {
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
function createEvent(method, path, body = null, token = null, pathParams = {}) {
  const headers = {
    'content-type': 'application/json'
  };
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }

  return {
    requestContext: {
      http: { method }
    },
    rawPath: path,
    path,
    pathParameters: pathParams,
    headers,
    body: body ? JSON.stringify(body) : null
  };
}

describe('Lambda API Handler & Security Tests', () => {

  beforeEach(() => {
    mockDb.clear();
  });

  test('1. Registering a user hashes the password with bcrypt', async () => {
    const event = createEvent('POST', '/auth/register', {
      email: 'alice@example.com',
      password: 'MySecretPassword123',
      name: 'Alice'
    });

    const res = await handler(event);
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body);
    assert.ok(body.token);
    assert.equal(body.user.email, 'alice@example.com');

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
      email: 'bob@example.com',
      password: 'BobSecurePassword!',
      name: 'Bob'
    });
    await handler(regEvent);

    // Login Bob
    const loginEvent = createEvent('POST', '/auth/login', {
      email: 'bob@example.com',
      password: 'BobSecurePassword!'
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
      email: 'charlie@example.com',
      password: 'CorrectPassword'
    });
    await handler(regEvent);

    const loginEvent = createEvent('POST', '/auth/login', {
      email: 'charlie@example.com',
      password: 'WrongPassword'
    });

    const res = await handler(loginEvent);
    assert.equal(res.statusCode, 401);

    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Invalid email or password');
  });

  test('4. Legacy user login triggers automatic lazy migration to bcrypt hash', async () => {
    // Seed a mock legacy user with legacyHash password
    const email = 'legacy@example.com';
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
    const email = 'legacy2@example.com';
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
    const email = 'legacy3@example.com';
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
    const validToken = jwt.sign({ userId: 'user_123' }, TEST_JWT_SECRET, { expiresIn: '1h' });

    const event = createEvent('POST', '/matches', {
      id: 'match_999',
      teamA: { name: 'Team A', players: [] },
      teamB: { name: 'Team B', players: [] }
    }, validToken);

    const res = await handler(event);
    assert.equal(res.statusCode, 201);

    const body = JSON.parse(res.body);
    assert.equal(body.id, 'match_999');
    assert.ok(mockDb.has('match_999'));
  });

  test('9. GET /matches/{id} where {id} is a USER record key returns 404 (Account Exposure Regression Test)', async () => {
    // Seed a mock user in DynamoDB
    const userKey = `user_${legacyHash('victim@example.com')}`;
    mockDb.set(userKey, {
      matchId: userKey,
      docType: 'USER',
      passwordHash: '$2b$12$MockHashValueWhichShouldNeverBeExposed',
      payload: {
        userId: userKey,
        email: 'victim@example.com',
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
    const userKey = `user_${legacyHash('target@example.com')}`;

    mockDb.set(userKey, {
      matchId: userKey,
      docType: 'USER',
      passwordHash: '$2b$12$SecretPasswordHash',
      payload: { userId: userKey, email: 'target@example.com' }
    });

    // Attacker attempts to delete user via DELETE /tournaments/{userKey}
    const event = createEvent('DELETE', `/tournaments/${userKey}`, null, validToken, { id: userKey });
    const res = await handler(event);

    assert.equal(res.statusCode, 404);

    // Verify user record was NOT deleted
    assert.ok(mockDb.has(userKey));
    assert.equal(mockDb.get(userKey).docType, 'USER');
  });

  test('11. Responses do NOT emit duplicate CORS headers but keep Content-Type', async () => {
    // 1. GET /matches (Public Route)
    const getRes = await handler(createEvent('GET', '/matches'));
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.headers['Content-Type'], 'application/json');
    assert.equal(getRes.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(getRes.headers['Access-Control-Allow-Methods'], undefined);
    assert.equal(getRes.headers['Access-Control-Allow-Headers'], undefined);

    // 2. POST /matches (Mutating Route Success)
    const validToken = jwt.sign({ userId: 'user_123' }, TEST_JWT_SECRET, { expiresIn: '1h' });
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

  test('12. GET /matches/{id} for a valid match record succeeds without Authorization header (Spectator Read Path)', async () => {
    const matchId = 'match_spectator_123';
    mockDb.set(matchId, {
      matchId,
      docType: 'MATCH',
      payload: {
        id: matchId,
        status: 'LIVE',
        totalRuns: 14,
        totalWickets: 1,
        teamA: { name: 'Rockets', players: [] },
        teamB: { name: 'Thunder', players: [] }
      }
    });

    const event = createEvent('GET', `/matches/${matchId}`, null, null, { id: matchId });
    const res = await handler(event);

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.id, matchId);
    assert.equal(body.totalRuns, 14);
    assert.equal(body.teamA.name, 'Rockets');
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

});
