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
import { resolveMx, resolve4, resolve6 } from 'node:dns/promises';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const secretsClient = new SecretsManagerClient({});

const TABLE_NAME = process.env.TABLE_NAME || 'CricMatches';
const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN;

let cachedJwtSecret = null;
const emailDomainCheckCache = new Map();

const DEFAULT_BLOCKED_EMAIL_DOMAINS = [
  'example.com',
  'example.net',
  'example.org',
  'test.com',
  'invalid',
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com'
];

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  },
  body: JSON.stringify(body)
});

function getClientPlatform(event) {
  const headers = event?.headers || {};
  const raw = headers['x-client-platform'] || headers['X-Client-Platform'] || '';
  return String(raw).trim().toLowerCase();
}

function isAndroidWriteEnforced() {
  return String(process.env.ENFORCE_ANDROID_MATCH_WRITES || 'false').toLowerCase() === 'true';
}

function isStrictRevisionEnforced() {
  return String(process.env.ENFORCE_STRICT_MATCH_REVISION || 'false').toLowerCase() === 'true';
}

function isAuthRateLimitEnabled() {
  return String(process.env.ENABLE_AUTH_RATE_LIMIT || 'true').toLowerCase() !== 'false';
}

function getAuthRateLimitMaxRequests() {
  const parsed = Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || 12);
  if (!Number.isFinite(parsed) || parsed <= 0) return 12;
  return Math.trunc(parsed);
}

function getAuthRateLimitWindowSeconds() {
  const parsed = Number(process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS || 60);
  if (!Number.isFinite(parsed) || parsed <= 0) return 60;
  return Math.trunc(parsed);
}

function getMatchWriteMaxBodyBytes() {
  const parsed = Number(process.env.MATCH_WRITE_MAX_BODY_BYTES || 262144);
  if (!Number.isFinite(parsed) || parsed <= 0) return 262144;
  return Math.trunc(parsed);
}

function getMatchWriteMaxBallEvents() {
  const parsed = Number(process.env.MATCH_WRITE_MAX_BALL_EVENTS || 3000);
  if (!Number.isFinite(parsed) || parsed <= 0) return 3000;
  return Math.trunc(parsed);
}

function getMatchWriteMaxWicketEvents() {
  const parsed = Number(process.env.MATCH_WRITE_MAX_WICKET_EVENTS || 400);
  if (!Number.isFinite(parsed) || parsed <= 0) return 400;
  return Math.trunc(parsed);
}

function getRequestBodyByteSize(event) {
  const rawBody = event?.body || '';
  if (!rawBody) return 0;

  if (event?.isBase64Encoded) {
    try {
      return Buffer.from(rawBody, 'base64').byteLength;
    } catch {
      return Buffer.byteLength(String(rawBody), 'utf8');
    }
  }

  return Buffer.byteLength(String(rawBody), 'utf8');
}

function getClientIpAddress(event) {
  const sourceIp = event?.requestContext?.http?.sourceIp;
  if (sourceIp) return String(sourceIp).trim();

  const headers = event?.headers || {};
  const forwarded = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '';
  const first = String(forwarded).split(',')[0]?.trim();
  return first || 'unknown';
}

async function enforceAuthRateLimit(event, routeKey, identityKey = null) {
  if (!isAuthRateLimitEnabled()) return null;

  const now = Date.now();
  const windowMs = getAuthRateLimitWindowSeconds() * 1000;
  const maxRequests = getAuthRateLimitMaxRequests();
  const ip = getClientIpAddress(event);
  const principal = String(identityKey || '').trim().toLowerCase() || `ip:${ip || 'unknown'}`;
  const principalKey = legacyHash(principal);
  const limiterId = `rl_${routeKey}_${principalKey}`;
  const nowIso = new Date(now).toISOString();
  const ttlSeconds = Math.floor(now / 1000) + Math.max(120, Math.ceil((windowMs * 2) / 1000));

  try {
    const existing = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { matchId: limiterId }
    }));

    const payload = existing.Item?.payload || {};
    const existingWindowStartMs = Number(payload.windowStartMs || 0);
    const existingCount = Number(payload.count || 0);
    const withinWindow = existingWindowStartMs > 0 && (now - existingWindowStartMs) < windowMs;

    let nextWindowStartMs = now;
    let nextCount = 1;

    if (withinWindow) {
      nextWindowStartMs = existingWindowStartMs;
      nextCount = existingCount + 1;
    }

    if (withinWindow && existingCount >= maxRequests) {
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - existingWindowStartMs)) / 1000))
      };
    }

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        matchId: limiterId,
        docType: 'RATE_LIMIT',
        updatedAt: nowIso,
        ttlSeconds,
        payload: {
          routeKey,
          principalKey,
          count: nextCount,
          windowStartMs: nextWindowStartMs,
          updatedAt: nowIso
        }
      }
    }));
  } catch (err) {
    console.warn('Auth rate-limit check failed, allowing request:', err?.message || err);
  }

  return null;
}

function enforceAndroidMatchWritePolicy(event) {
  if (!isAndroidWriteEnforced()) return null;
  const clientPlatform = getClientPlatform(event);
  if (clientPlatform !== 'android') {
    return response(403, {
      error: 'Match scoring writes are allowed only from Android app clients',
      code: 'ANDROID_CLIENT_REQUIRED'
    });
  }
  return null;
}

function toRevisionNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  return normalized >= 0 ? normalized : fallback;
}

function buildSyncMetadata({ accepted, revision, serverUpdatedAt, reason = null, legacyAutoBump = false }) {
  return {
    accepted: Boolean(accepted),
    revision: toRevisionNumber(revision, 0),
    serverUpdatedAt,
    rejectionReason: reason,
    legacyAutoBump: Boolean(legacyAutoBump)
  };
}

function buildMatchSnapshotCondition(existingItem) {
  if (!existingItem) {
    return {
      ConditionExpression: 'attribute_not_exists(#matchId)',
      ExpressionAttributeNames: { '#matchId': 'matchId' }
    };
  }

  const names = { '#revision': 'revision', '#shareVersion': 'spectatorTokenVersion' };
  const values = {};
  const conditions = [];
  for (const [field, alias, valueAlias] of [
    ['revision', '#revision', ':expectedRevision'],
    ['spectatorTokenVersion', '#shareVersion', ':expectedShareVersion']
  ]) {
    if (existingItem[field] === undefined || existingItem[field] === null) {
      conditions.push(`attribute_not_exists(${alias})`);
    } else {
      conditions.push(`${alias} = ${valueAlias}`);
      values[valueAlias] = existingItem[field];
    }
  }

  return {
    ConditionExpression: conditions.join(' AND '),
    ExpressionAttributeNames: names,
    ...(Object.keys(values).length ? { ExpressionAttributeValues: values } : {})
  };
}

function isConditionalCheckFailed(error) {
  return error?.name === 'ConditionalCheckFailedException';
}

function extractOwnerUserId(item) {
  return item?.ownerUserId || item?.payload?.ownerUserId || null;
}

function isOwnedByUser(item, userId) {
  if (!item || !userId) return false;
  return extractOwnerUserId(item) === userId;
}

function preserveSpectatorMetadata(existingPayload, incomingPayload) {
  const existing = existingPayload || {};
  const incoming = incomingPayload || {};

  // Share token lifecycle is controlled by dedicated endpoints only.
  incoming.spectatorTokenVersion = Number(existing.spectatorTokenVersion || 0);
  incoming.spectatorShareActive = Boolean(existing.spectatorShareActive || false);
  incoming.spectatorShareExpiresInSeconds = existing.spectatorShareExpiresInSeconds ?? null;
  incoming.spectatorShareIssuedAt = existing.spectatorShareIssuedAt ?? null;
  incoming.spectatorShareRevokedAt = existing.spectatorShareRevokedAt ?? null;

  return incoming;
}

async function enforceMatchWritePayloadLimits({ event, payload, method, path, actorUserId, actorEmail, matchId }) {
  const requestSizeBytes = getRequestBodyByteSize(event);
  const maxBodyBytes = getMatchWriteMaxBodyBytes();
  if (requestSizeBytes > maxBodyBytes) {
    await logAuditEvent({
      action: 'MATCH_WRITE_REJECT_PAYLOAD_TOO_LARGE',
      actorUserId,
      actorEmail,
      targetId: matchId,
      metadata: {
        method,
        path,
        requestSizeBytes,
        maxBodyBytes
      }
    });

    return response(413, {
      error: 'Match payload exceeds allowed size',
      code: 'MATCH_PAYLOAD_TOO_LARGE',
      limits: {
        maxBodyBytes,
        requestSizeBytes
      }
    });
  }

  const ballHistoryCount = Array.isArray(payload?.ballHistory) ? payload.ballHistory.length : 0;
  const wicketHistoryCount = Array.isArray(payload?.wicketHistory) ? payload.wicketHistory.length : 0;
  const maxBallEvents = getMatchWriteMaxBallEvents();
  const maxWicketEvents = getMatchWriteMaxWicketEvents();

  if (ballHistoryCount > maxBallEvents || wicketHistoryCount > maxWicketEvents) {
    await logAuditEvent({
      action: 'MATCH_WRITE_REJECT_EVENT_LIMIT_EXCEEDED',
      actorUserId,
      actorEmail,
      targetId: matchId,
      metadata: {
        method,
        path,
        ballHistoryCount,
        wicketHistoryCount,
        maxBallEvents,
        maxWicketEvents
      }
    });

    return response(422, {
      error: 'Match event history exceeds allowed limits',
      code: 'MATCH_SYNC_LIMIT_EXCEEDED',
      limits: {
        maxBallEvents,
        maxWicketEvents,
        ballHistoryCount,
        wicketHistoryCount
      }
    });
  }

  return null;
}

function normalizeEmail(rawEmail) {
  return String(rawEmail || '').trim().toLowerCase();
}

function isValidEmailSyntax(email) {
  if (!email || email.length > 254) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return emailRegex.test(email);
}

function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8 || password.length > 128) return false;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  return hasLetter && hasDigit;
}

function getBlockedEmailDomains() {
  const envRaw = process.env.BLOCKED_EMAIL_DOMAINS || '';
  const envDomains = envRaw
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_BLOCKED_EMAIL_DOMAINS, ...envDomains]);
}

function isReservedOrBlockedDomain(domain) {
  const blocked = getBlockedEmailDomains();
  return blocked.has(domain);
}

function isObviouslyDummyLocalPart(localPart) {
  const lp = String(localPart || '').trim().toLowerCase();
  if (!lp) return true;

  const obviousValues = new Set([
    'test',
    'dummy',
    'fake',
    'sample',
    'unknown',
    'na',
    'none',
    'admin'
  ]);

  return obviousValues.has(lp);
}

async function isDeliverableEmailDomain(domain) {
  const normalized = String(domain || '').trim().toLowerCase();
  if (!normalized) return false;

  if (emailDomainCheckCache.has(normalized)) {
    return emailDomainCheckCache.get(normalized);
  }

  const dnsCheckEnabled = process.env.ENFORCE_EMAIL_DOMAIN_DNS !== 'false';
  if (!dnsCheckEnabled) {
    emailDomainCheckCache.set(normalized, true);
    return true;
  }

  const timeoutMs = Number(process.env.EMAIL_DNS_TIMEOUT_MS || 2500);
  const check = (async () => {
    try {
      const mx = await resolveMx(normalized);
      if (Array.isArray(mx) && mx.length > 0) return true;
    } catch (_) {
      // ignore and continue with A/AAAA checks
    }

    try {
      const a = await resolve4(normalized);
      if (Array.isArray(a) && a.length > 0) return true;
    } catch (_) {
      // ignore and continue
    }

    try {
      const aaaa = await resolve6(normalized);
      if (Array.isArray(aaaa) && aaaa.length > 0) return true;
    } catch (_) {
      // no resolvable records
    }

    return false;
  })();

  const timed = Promise.race([
    check,
    new Promise(resolve => setTimeout(() => resolve(false), timeoutMs))
  ]);

  const result = Boolean(await timed);
  emailDomainCheckCache.set(normalized, result);
  return result;
}

async function verifySpectatorToken(event, expectedMatchId, expectedTokenVersion) {
  const headers = event.headers || {};
  const query = event.queryStringParameters || {};
  const token = query.st || headers['x-spectator-token'] || headers['X-Spectator-Token'] || null;
  if (!token) return null;

  try {
    const secret = await getJwtSecret();
    const decoded = jwt.verify(token, secret);
    if (!decoded || decoded.purpose !== 'spectate') return null;
    if (!decoded.matchId || decoded.matchId !== expectedMatchId) return null;
    const expectedVersion = Number(expectedTokenVersion || 0);
    const tokenVersion = Number(decoded.sv);
    if (!Number.isInteger(tokenVersion) || tokenVersion !== expectedVersion) return null;
    return decoded;
  } catch (err) {
    return null;
  }
}

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

const DESIGNATED_ADMIN_EMAILS = new Set([
  'ankoji@gmail.com',
  ...(process.env.ADMIN_EMAILS || '').split(',').map(e => normalizeEmail(e)).filter(Boolean)
]);

function isAdminEmail(email) {
  if (!email) return false;
  return DESIGNATED_ADMIN_EMAILS.has(normalizeEmail(email));
}

export async function enforceAdminAuth(event) {
  const authUser = await verifyAuthToken(event);
  if (!authUser) {
    return { statusCode: 401, body: response(401, { error: 'Authentication required' }) };
  }

  const userDoc = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { matchId: authUser.userId }
  }));

  const userEmail = normalizeEmail(userDoc.Item?.payload?.email || userDoc.Item?.email || authUser.email || '');
  const isAdminRole = userDoc.Item?.payload?.role === 'ADMIN' || userDoc.Item?.role === 'ADMIN' || userDoc.Item?.payload?.isAdmin === true;

  if (!isAdminEmail(userEmail) && !isAdminRole) {
    return { statusCode: 403, body: response(403, { error: 'Admin access required' }) };
  }

  return { userId: authUser.userId, email: userEmail, userDoc: userDoc.Item };
}

export async function logAuditEvent({ action, actorUserId, actorEmail, targetId, metadata }) {
  try {
    const logId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const ttlSeconds = Math.floor(now.getTime() / 1000) + (30 * 24 * 60 * 60);

    const auditDoc = {
      id: logId,
      docType: 'AUDIT_LOG',
      action,
      actorUserId: actorUserId || 'SYSTEM',
      actorEmail: actorEmail || 'system',
      targetId: targetId || null,
      metadata: metadata || {},
      timestamp: now.toISOString(),
      ttlSeconds
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        matchId: logId,
        docType: 'AUDIT_LOG',
        payload: auditDoc,
        createdAt: auditDoc.timestamp,
        ttlSeconds
      }
    }));
  } catch (err) {
    console.warn('Failed to record audit log:', err);
  }
}

export async function logSystemError({ source, error, userId, userEmail, path, statusCode }) {
  try {
    const logId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const ttlSeconds = Math.floor(now.getTime() / 1000) + (30 * 24 * 60 * 60);

    const errorDoc = {
      id: logId,
      docType: 'ERROR_LOG',
      source: source || 'LAMBDA',
      errorMessage: String(error?.message || error || 'Unknown error'),
      stack: String(error?.stack || ''),
      userId: userId || null,
      userEmail: userEmail || null,
      path: path || null,
      statusCode: statusCode || 500,
      timestamp: now.toISOString(),
      ttlSeconds
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        matchId: logId,
        docType: 'ERROR_LOG',
        payload: errorDoc,
        createdAt: errorDoc.timestamp,
        ttlSeconds
      }
    }));
  } catch (err) {
    console.warn('Failed to record error log:', err);
  }
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.rawPath || event.path;
  const pathParams = event.pathParameters || {};

  // Note: API Gateway's CorsConfiguration normally intercepts and answers preflight OPTIONS requests before reaching Lambda.
  if (method === 'OPTIONS') {
    return response(200, { status: 'OK' });
  }

  try {
    // ------------------- ADMIN ROUTES -------------------
    if (method === 'GET' && path === '/admin/users') {
      const adminAuth = await enforceAdminAuth(event);
      if (adminAuth.statusCode) return adminAuth.body;

      const scanResult = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME
      }));

      const matchItems = (scanResult.Items || []).filter(item => !item.docType || item.docType === 'MATCH');
      const userItems = (scanResult.Items || []).filter(item => item.docType === 'USER');

      const userMatchCounts = new Map();
      const userLastActive = new Map();

      matchItems.forEach(item => {
        const ownerId = extractOwnerUserId(item);
        if (ownerId) {
          userMatchCounts.set(ownerId, (userMatchCounts.get(ownerId) || 0) + 1);
          const itemUpdated = item.updatedAt || item.payload?.updatedAt || item.createdAt;
          if (itemUpdated) {
            const prev = userLastActive.get(ownerId);
            if (!prev || new Date(itemUpdated) > new Date(prev)) {
              userLastActive.set(ownerId, itemUpdated);
            }
          }
        }
      });

      const usersList = userItems.map(item => {
        const payload = item.payload || item;
        const uId = payload.userId || item.matchId;
        return {
          userId: uId,
          email: payload.email || 'N/A',
          name: payload.name || 'User',
          createdAt: payload.createdAt || item.createdAt || null,
          matchCount: userMatchCounts.get(uId) || 0,
          lastActiveAt: userLastActive.get(uId) || payload.createdAt || null
        };
      }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      return response(200, { users: usersList, totalUsers: usersList.length });
    }

    if (method === 'GET' && path === '/admin/system-health') {
      const adminAuth = await enforceAdminAuth(event);
      if (adminAuth.statusCode) return adminAuth.body;

      const dbStart = Date.now();
      const scanResult = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        Select: 'COUNT'
      }));
      const dbLatencyMs = Date.now() - dbStart;

      return response(200, {
        status: 'HEALTHY',
        dbLatencyMs,
        tableName: TABLE_NAME,
        totalItemsCount: scanResult.Count || 0,
        memoryUsage: process.memoryUsage(),
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      });
    }

    if (method === 'GET' && path === '/admin/auth-sync') {
      const adminAuth = await enforceAdminAuth(event);
      if (adminAuth.statusCode) return adminAuth.body;

      const scanResult = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME
      }));

      const items = scanResult.Items || [];
      const userCount = items.filter(item => item.docType === 'USER').length;
      const matchCount = items.filter(item => !item.docType || item.docType === 'MATCH').length;
      const activeShares = items.filter(item => {
        const p = item.payload || item;
        return p.spectatorShareActive === true;
      }).length;

      return response(200, {
        totalUsers: userCount,
        totalMatches: matchCount,
        activeSpectatorShares: activeShares,
        timestamp: new Date().toISOString()
      });
    }

    if (method === 'GET' && path === '/admin/error-dashboard') {
      const adminAuth = await enforceAdminAuth(event);
      if (adminAuth.statusCode) return adminAuth.body;

      const scanResult = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME
      }));

      const errorLogs = (scanResult.Items || [])
        .filter(item => item.docType === 'ERROR_LOG')
        .map(item => item.payload || item)
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
        .slice(0, 100);

      return response(200, { errors: errorLogs });
    }

    if (method === 'GET' && path === '/admin/audit-logs') {
      const adminAuth = await enforceAdminAuth(event);
      if (adminAuth.statusCode) return adminAuth.body;

      const scanResult = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME
      }));

      const auditLogs = (scanResult.Items || [])
        .filter(item => item.docType === 'AUDIT_LOG')
        .map(item => item.payload || item)
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
        .slice(0, 100);

      return response(200, { auditLogs });
    }

    if (method === 'POST' && path === '/admin/error-log') {
      const body = JSON.parse(event.body || '{}');
      await logSystemError({
        source: body.source || 'FRONTEND',
        error: body.error || 'Client Reported Error',
        userId: body.userId || null,
        userEmail: body.userEmail || null,
        path: body.path || null,
        statusCode: body.statusCode || 500
      });
      return response(200, { status: 'LOGGED' });
    }

    // ------------------- AUTH ROUTES -------------------
    if (method === 'POST' && path === '/auth/register') {
      const body = JSON.parse(event.body || '{}');
      const { email, password, name } = body;
      if (!email || !password) {
        return response(400, { error: 'Email and password required' });
      }

      const emailLower = normalizeEmail(email);

      const registerLimit = await enforceAuthRateLimit(event, 'auth_register', emailLower);
      if (registerLimit?.limited) {
        await logAuditEvent({
          action: 'AUTH_RATE_LIMIT_HIT',
          actorUserId: null,
          actorEmail: emailLower,
          targetId: 'auth/register',
          metadata: {
            route: '/auth/register',
            clientIp: getClientIpAddress(event),
            retryAfterSeconds: registerLimit.retryAfterSeconds
          }
        });
        return response(429, {
          error: 'Too many registration attempts. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfterSeconds: registerLimit.retryAfterSeconds
        });
      }

      if (!isValidEmailSyntax(emailLower)) {
        return response(400, { error: 'Please enter a valid email address' });
      }

      if (!isStrongPassword(password)) {
        return response(400, { error: 'Password must be at least 8 characters and include letters and numbers' });
      }

      const emailParts = emailLower.split('@');
      const emailLocal = emailParts[0] || '';
      const emailDomain = emailParts[1] || '';

      if (isReservedOrBlockedDomain(emailDomain) || isObviouslyDummyLocalPart(emailLocal)) {
        return response(400, { error: 'Please use a real email address you can access' });
      }

      const isDeliverableDomain = await isDeliverableEmailDomain(emailDomain);
      if (!isDeliverableDomain) {
        return response(400, { error: 'Email domain appears invalid or unreachable' });
      }

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
        name: name || emailLocal,
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

      const emailLower = normalizeEmail(email);

      const loginLimit = await enforceAuthRateLimit(event, 'auth_login', emailLower);
      if (loginLimit?.limited) {
        await logAuditEvent({
          action: 'AUTH_RATE_LIMIT_HIT',
          actorUserId: null,
          actorEmail: emailLower,
          targetId: 'auth/login',
          metadata: {
            route: '/auth/login',
            clientIp: getClientIpAddress(event),
            retryAfterSeconds: loginLimit.retryAfterSeconds
          }
        });
        return response(429, {
          error: 'Too many login attempts. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfterSeconds: loginLimit.retryAfterSeconds
        });
      }

      if (!isValidEmailSyntax(emailLower)) {
        return response(400, { error: 'Please enter a valid email address' });
      }
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
      const authUser = await enforceAuth();
      if (authUser.statusCode) return authUser;

      const data = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
      const items = (data.Items || [])
        .filter(item => (!item.docType || item.docType === 'MATCH') && isOwnedByUser(item, authUser.userId))
        .map(item => item.payload || item);
      return response(200, items);
    }

    if (method === 'GET' && path.startsWith('/matches/') && pathParams.id) {
      const authUser = await verifyAuthToken(event);
      const data = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));

      // Account exposure regression fix: Must be docType === 'MATCH' (or legacy match without docType)
      const isMatchDoc = data.Item && (!data.Item.docType || data.Item.docType === 'MATCH');
      if (!isMatchDoc) {
        return response(404, { error: 'Match not found' });
      }

      if (authUser && isOwnedByUser(data.Item, authUser.userId)) {
        return response(200, data.Item.payload || data.Item);
      }

      const matchPayload = data.Item.payload || data.Item;
      const spectatorTokenVersion = Number(matchPayload?.spectatorTokenVersion || 0);
      const spectatorToken = await verifySpectatorToken(event, pathParams.id, spectatorTokenVersion);
      if (!spectatorToken) {
        return response(403, { error: 'Forbidden' });
      }

      if (matchPayload?.spectatorShareActive !== true) {
        return response(410, { error: 'Shared live link has been revoked' });
      }

      if ((matchPayload?.status || '').toUpperCase() !== 'LIVE') {
        return response(410, { error: 'Shared live link expired' });
      }

      return response(200, data.Item.payload || data.Item);
    }

    if (method === 'POST' && path.startsWith('/matches/') && path.endsWith('/share-token') && pathParams.id) {
      const authUser = await enforceAuth();
      if (authUser.statusCode) return authUser;

      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));
      const isMatchDoc = existing.Item && (!existing.Item.docType || existing.Item.docType === 'MATCH');
      if (!isMatchDoc) {
        return response(404, { error: 'Match not found' });
      }
      if (!isOwnedByUser(existing.Item, authUser.userId)) {
        return response(403, { error: 'Forbidden' });
      }

      const matchPayload = existing.Item.payload || existing.Item;
      if ((matchPayload?.status || '').toUpperCase() !== 'LIVE') {
        return response(400, { error: 'Share token can be created only for LIVE matches' });
      }

      const requestBody = JSON.parse(event.body || '{}');
      const requestedTtlMinutes = Number(requestBody?.ttlMinutes || 0);
      const allowedTtlMinutes = [15, 60, 360];
      const ttlMinutes = allowedTtlMinutes.includes(requestedTtlMinutes) ? requestedTtlMinutes : 360;
      const expiresInSeconds = ttlMinutes * 60;

      const nextSpectatorTokenVersion = Number(matchPayload?.spectatorTokenVersion || 0) + 1;
      const updatedPayload = {
        ...matchPayload,
        spectatorTokenVersion: nextSpectatorTokenVersion,
        spectatorShareActive: true,
        spectatorShareExpiresInSeconds: expiresInSeconds,
        spectatorShareIssuedAt: new Date().toISOString(),
        spectatorShareRevokedAt: null
      };
      try {
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...existing.Item,
            updatedAt: new Date().toISOString(),
            payload: updatedPayload,
            spectatorTokenVersion: nextSpectatorTokenVersion,
            spectatorShareActive: true,
            spectatorShareExpiresInSeconds: expiresInSeconds,
            spectatorShareIssuedAt: updatedPayload.spectatorShareIssuedAt,
            spectatorShareRevokedAt: null
          },
          ...buildMatchSnapshotCondition(existing.Item)
        }));
      } catch (err) {
        if (isConditionalCheckFailed(err)) {
          return response(409, { error: 'Match changed while creating the share link', code: 'SHARE_STATE_CHANGED' });
        }
        throw err;
      }

      const secret = await getJwtSecret();
      const spectatorToken = jwt.sign(
        {
          purpose: 'spectate',
          matchId: pathParams.id,
          ownerUserId: authUser.userId,
          sv: nextSpectatorTokenVersion
        },
        secret,
        { expiresIn: expiresInSeconds }
      );

      return response(200, {
        matchId: pathParams.id,
        spectatorToken,
        tokenVersion: nextSpectatorTokenVersion,
        expiresInSeconds,
        shareStatus: {
          active: true,
          ttlMinutes,
          issuedAt: updatedPayload.spectatorShareIssuedAt
        }
      });
    }

    if (method === 'POST' && path.startsWith('/matches/') && path.endsWith('/revoke-share') && pathParams.id) {
      const authUser = await enforceAuth();
      if (authUser.statusCode) return authUser;

      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));
      const isMatchDoc = existing.Item && (!existing.Item.docType || existing.Item.docType === 'MATCH');
      if (!isMatchDoc) {
        return response(404, { error: 'Match not found' });
      }
      if (!isOwnedByUser(existing.Item, authUser.userId)) {
        return response(403, { error: 'Forbidden' });
      }

      const matchPayload = existing.Item.payload || existing.Item;
      const nextSpectatorTokenVersion = Number(matchPayload?.spectatorTokenVersion || 0) + 1;
      const updatedPayload = {
        ...matchPayload,
        spectatorTokenVersion: nextSpectatorTokenVersion,
        spectatorShareActive: false,
        spectatorShareRevokedAt: new Date().toISOString()
      };
      try {
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...existing.Item,
            updatedAt: new Date().toISOString(),
            payload: updatedPayload,
            spectatorTokenVersion: nextSpectatorTokenVersion,
            spectatorShareActive: false,
            spectatorShareRevokedAt: updatedPayload.spectatorShareRevokedAt
          },
          ...buildMatchSnapshotCondition(existing.Item)
        }));
      } catch (err) {
        if (isConditionalCheckFailed(err)) {
          return response(409, { error: 'Match changed while revoking the share link', code: 'SHARE_STATE_CHANGED' });
        }
        throw err;
      }

      return response(200, {
        matchId: pathParams.id,
        revoked: true,
        shareStatus: {
          active: false,
          revokedAt: updatedPayload.spectatorShareRevokedAt
        }
      });
    }

    if (method === 'POST' && path === '/matches') {
      const authUser = await enforceAuth();
      if (authUser.statusCode) return authUser;

      const platformDenied = enforceAndroidMatchWritePolicy(event);
      if (platformDenied) return platformDenied;

      const payload = JSON.parse(event.body || '{}');
      const matchId = payload.id || payload.matchId || `match_${Date.now()}`;

      const payloadLimitDenied = await enforceMatchWritePayloadLimits({
        event,
        payload,
        method: 'POST',
        path: '/matches',
        actorUserId: authUser.userId,
        actorEmail: authUser.email,
        matchId
      });
      if (payloadLimitDenied) return payloadLimitDenied;

      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId }
      }));

      const isMatchDoc = existing.Item && (!existing.Item.docType || existing.Item.docType === 'MATCH');
      if (existing.Item && !isMatchDoc) {
        return response(404, { error: 'Match not found' });
      }
      if (existing.Item && !isOwnedByUser(existing.Item, authUser.userId)) {
        await logAuditEvent({
          action: 'MATCH_WRITE_REJECT_OWNER_MISMATCH',
          actorUserId: authUser.userId,
          actorEmail: authUser.email,
          targetId: matchId,
          metadata: { method: 'POST', path: '/matches' }
        });
        return response(403, { error: 'Forbidden' });
      }

      payload.id = matchId;
      payload.ownerUserId = authUser.userId;
      const existingPayload = existing.Item?.payload || {};
      const existingRevision = toRevisionNumber(existingPayload.revision, 0);
      const hasIncomingRevision = payload.revision !== undefined && payload.revision !== null;

      if (isStrictRevisionEnforced() && !hasIncomingRevision) {
        await logAuditEvent({
          action: 'MATCH_WRITE_REJECT_REVISION_REQUIRED',
          actorUserId: authUser.userId,
          actorEmail: authUser.email,
          targetId: matchId,
          metadata: { method: 'POST', path: '/matches' }
        });
        return response(400, {
          error: 'Revision is required for match writes',
          code: 'REVISION_REQUIRED'
        });
      }

      const incomingRevisionRaw = hasIncomingRevision
        ? toRevisionNumber(payload.revision, existingRevision)
        : (existingRevision + 1);

      if (existing.Item && hasIncomingRevision && incomingRevisionRaw <= existingRevision) {
        await logAuditEvent({
          action: 'MATCH_WRITE_REJECT_STALE_REVISION',
          actorUserId: authUser.userId,
          actorEmail: authUser.email,
          targetId: matchId,
          metadata: {
            method: 'POST',
            path: '/matches',
            incomingRevision: incomingRevisionRaw,
            existingRevision
          }
        });
        return response(409, {
          error: 'Stale match update rejected',
          code: 'STALE_REVISION',
          sync: buildSyncMetadata({
            accepted: false,
            revision: existingRevision,
            serverUpdatedAt: existing.Item.updatedAt || existingPayload.updatedAt || null,
            reason: `incoming_revision_${incomingRevisionRaw}_not_newer_than_${existingRevision}`
          })
        });
      }

      const appliedRevision = existing.Item
        ? (hasIncomingRevision ? incomingRevisionRaw : existingRevision + 1)
        : (hasIncomingRevision ? Math.max(incomingRevisionRaw, 1) : 1);
      const serverUpdatedAt = new Date().toISOString();

      payload.revision = appliedRevision;
      payload.updatedAt = serverUpdatedAt;
      payload.lastWriterPlatform = getClientPlatform(event) === 'android' ? 'ANDROID' : 'UNKNOWN';
      payload.spectatorTokenVersion = Number(payload.spectatorTokenVersion || 0);
      payload.spectatorShareActive = Boolean(payload.spectatorShareActive || false);
      payload.spectatorShareExpiresInSeconds = payload.spectatorShareExpiresInSeconds ?? null;
      payload.spectatorShareIssuedAt = payload.spectatorShareIssuedAt ?? null;
      payload.spectatorShareRevokedAt = payload.spectatorShareRevokedAt ?? null;

      try {
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            matchId,
            docType: 'MATCH',
            ownerUserId: authUser.userId,
            updatedAt: serverUpdatedAt,
            revision: appliedRevision,
            spectatorTokenVersion: payload.spectatorTokenVersion,
            lastWriterPlatform: payload.lastWriterPlatform,
            status: payload.status || 'LIVE',
            payload
          },
          ...buildMatchSnapshotCondition(existing.Item)
        }));
      } catch (err) {
        if (isConditionalCheckFailed(err)) {
          const latest = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { matchId } }));
          const latestPayload = latest.Item?.payload || {};
          const latestRevision = toRevisionNumber(latest.Item?.revision ?? latestPayload.revision, existingRevision);
          return response(409, {
            error: 'Stale match update rejected',
            code: 'STALE_REVISION',
            sync: buildSyncMetadata({
              accepted: false,
              revision: latestRevision,
              serverUpdatedAt: latest.Item?.updatedAt || latestPayload.updatedAt || null,
              reason: 'concurrent_match_or_share_update'
            })
          });
        }
        throw err;
      }

      return response(existing.Item ? 200 : 201, {
        ...payload,
        sync: buildSyncMetadata({
          accepted: true,
          revision: appliedRevision,
          serverUpdatedAt,
          legacyAutoBump: !hasIncomingRevision
        })
      });
    }

    if (method === 'PUT' && pathParams.id) {
      const authUser = await enforceAuth();
      if (authUser.statusCode) return authUser;

      const platformDenied = enforceAndroidMatchWritePolicy(event);
      if (platformDenied) return platformDenied;

      // docType protection: Verify existing item is a MATCH before overwriting
      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));

      if (existing.Item && existing.Item.docType && existing.Item.docType !== 'MATCH') {
        return response(404, { error: 'Match not found' });
      }
      if (!existing.Item || !isOwnedByUser(existing.Item, authUser.userId)) {
        await logAuditEvent({
          action: 'MATCH_WRITE_REJECT_OWNER_MISMATCH',
          actorUserId: authUser.userId,
          actorEmail: authUser.email,
          targetId: pathParams.id,
          metadata: { method: 'PUT', path: `/matches/${pathParams.id}` }
        });
        return response(403, { error: 'Forbidden' });
      }

      const payload = JSON.parse(event.body || '{}');
      payload.id = pathParams.id;
      payload.ownerUserId = authUser.userId;

      const payloadLimitDenied = await enforceMatchWritePayloadLimits({
        event,
        payload,
        method: 'PUT',
        path: `/matches/${pathParams.id}`,
        actorUserId: authUser.userId,
        actorEmail: authUser.email,
        matchId: pathParams.id
      });
      if (payloadLimitDenied) return payloadLimitDenied;

      const existingPayload = existing.Item?.payload || {};
      const existingRevision = toRevisionNumber(existingPayload.revision, 0);
      const hasIncomingRevision = payload.revision !== undefined && payload.revision !== null;

      if (isStrictRevisionEnforced() && !hasIncomingRevision) {
        await logAuditEvent({
          action: 'MATCH_WRITE_REJECT_REVISION_REQUIRED',
          actorUserId: authUser.userId,
          actorEmail: authUser.email,
          targetId: pathParams.id,
          metadata: { method: 'PUT', path: `/matches/${pathParams.id}` }
        });
        return response(400, {
          error: 'Revision is required for match writes',
          code: 'REVISION_REQUIRED'
        });
      }

      const incomingRevisionRaw = hasIncomingRevision
        ? toRevisionNumber(payload.revision, existingRevision)
        : (existingRevision + 1);

      if (hasIncomingRevision && incomingRevisionRaw <= existingRevision) {
        await logAuditEvent({
          action: 'MATCH_WRITE_REJECT_STALE_REVISION',
          actorUserId: authUser.userId,
          actorEmail: authUser.email,
          targetId: pathParams.id,
          metadata: {
            method: 'PUT',
            path: `/matches/${pathParams.id}`,
            incomingRevision: incomingRevisionRaw,
            existingRevision
          }
        });
        return response(409, {
          error: 'Stale match update rejected',
          code: 'STALE_REVISION',
          sync: buildSyncMetadata({
            accepted: false,
            revision: existingRevision,
            serverUpdatedAt: existing.Item.updatedAt || existingPayload.updatedAt || null,
            reason: `incoming_revision_${incomingRevisionRaw}_not_newer_than_${existingRevision}`
          })
        });
      }

      const appliedRevision = hasIncomingRevision ? incomingRevisionRaw : (existingRevision + 1);
      const serverUpdatedAt = new Date().toISOString();

      payload.revision = appliedRevision;
      payload.updatedAt = serverUpdatedAt;
      payload.lastWriterPlatform = getClientPlatform(event) === 'android' ? 'ANDROID' : 'UNKNOWN';
      preserveSpectatorMetadata(existingPayload, payload);

      try {
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            matchId: pathParams.id,
            docType: 'MATCH',
            ownerUserId: authUser.userId,
            updatedAt: serverUpdatedAt,
            revision: appliedRevision,
            spectatorTokenVersion: payload.spectatorTokenVersion,
            lastWriterPlatform: payload.lastWriterPlatform,
            status: payload.status || 'LIVE',
            payload
          },
          ...buildMatchSnapshotCondition(existing.Item)
        }));
      } catch (err) {
        if (isConditionalCheckFailed(err)) {
          const latest = await docClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { matchId: pathParams.id }
          }));
          const latestPayload = latest.Item?.payload || {};
          const latestRevision = toRevisionNumber(latest.Item?.revision ?? latestPayload.revision, existingRevision);
          return response(409, {
            error: 'Stale match update rejected',
            code: 'STALE_REVISION',
            sync: buildSyncMetadata({
              accepted: false,
              revision: latestRevision,
              serverUpdatedAt: latest.Item?.updatedAt || latestPayload.updatedAt || null,
              reason: 'concurrent_match_or_share_update'
            })
          });
        }
        throw err;
      }

      return response(200, {
        ...payload,
        sync: buildSyncMetadata({
          accepted: true,
          revision: appliedRevision,
          serverUpdatedAt,
          legacyAutoBump: !hasIncomingRevision
        })
      });
    }

    if (method === 'DELETE' && path.startsWith('/matches/') && pathParams.id) {
      const authUser = await enforceAuth();
      if (authUser.statusCode) return authUser;

      const platformDenied = enforceAndroidMatchWritePolicy(event);
      if (platformDenied) return platformDenied;

      // docType protection: Refuse unless item exists and is docType === 'MATCH'
      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));

      const isMatchDoc = existing.Item && (!existing.Item.docType || existing.Item.docType === 'MATCH');
      if (!isMatchDoc) {
        return response(404, { error: 'Match not found' });
      }
      if (!isOwnedByUser(existing.Item, authUser.userId)) {
        await logAuditEvent({
          action: 'MATCH_WRITE_REJECT_OWNER_MISMATCH',
          actorUserId: authUser.userId,
          actorEmail: authUser.email,
          targetId: pathParams.id,
          metadata: { method: 'DELETE', path: `/matches/${pathParams.id}` }
        });
        return response(403, { error: 'Forbidden' });
      }

      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));
      return response(200, { message: 'Match deleted successfully' });
    }

    // ------------------- TOURNAMENTS / SERIES ROUTES -------------------
    if (method === 'GET' && path === '/tournaments') {
      const authUser = await enforceAuth();
      if (authUser.statusCode) return authUser;

      const data = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
      const items = (data.Items || [])
        .filter(item => item.docType === 'TOURNAMENT' && isOwnedByUser(item, authUser.userId))
        .map(item => item.payload || item);
      return response(200, items);
    }

    if (method === 'POST' && path === '/tournaments') {
      const authUser = await enforceAuth();
      if (authUser.statusCode) return authUser;

      const payload = JSON.parse(event.body || '{}');
      const tourneyId = payload.id || `tourney_${Date.now()}`;
      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: tourneyId }
      }));
      if (existing.Item && existing.Item.docType !== 'TOURNAMENT') {
        return response(404, { error: 'Tournament not found' });
      }
      if (existing.Item && !isOwnedByUser(existing.Item, authUser.userId)) {
        return response(403, { error: 'Forbidden' });
      }

      payload.id = tourneyId;
      payload.ownerUserId = authUser.userId;
      const serverUpdatedAt = new Date().toISOString();
      payload.updatedAt = serverUpdatedAt;

      try {
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            matchId: tourneyId,
            docType: 'TOURNAMENT',
            ownerUserId: authUser.userId,
            updatedAt: serverUpdatedAt,
            payload
          },
          ...(existing.Item
            ? {
                ConditionExpression: '#docType = :docType AND #ownerUserId = :ownerUserId AND #updatedAt = :expectedUpdatedAt',
                ExpressionAttributeNames: {
                  '#docType': 'docType',
                  '#ownerUserId': 'ownerUserId',
                  '#updatedAt': 'updatedAt'
                },
                ExpressionAttributeValues: {
                  ':docType': 'TOURNAMENT',
                  ':ownerUserId': authUser.userId,
                  ':expectedUpdatedAt': existing.Item.updatedAt
                }
              }
            : {
                ConditionExpression: 'attribute_not_exists(#matchId)',
                ExpressionAttributeNames: { '#matchId': 'matchId' }
              })
        }));
      } catch (err) {
        if (isConditionalCheckFailed(err)) {
          return response(409, { error: 'Tournament changed during save', code: 'STALE_TOURNAMENT' });
        }
        throw err;
      }
      return response(existing.Item ? 200 : 201, payload);
    }

    if (method === 'DELETE' && path.startsWith('/tournaments/') && pathParams.id) {
      const authUser = await enforceAuth();
      if (authUser.statusCode) return authUser;

      const tourneyId = pathParams.id;

      // docType protection: Refuse unless item exists and is docType === 'TOURNAMENT'
      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: tourneyId }
      }));

      if (!existing.Item || existing.Item.docType !== 'TOURNAMENT') {
        return response(404, { error: 'Tournament not found' });
      }
      if (!isOwnedByUser(existing.Item, authUser.userId)) {
        return response(403, { error: 'Forbidden' });
      }

      const scanData = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
      const matchesToDelete = (scanData.Items || []).filter(item => {
        const payload = item.payload || item;
        return (item.docType === 'MATCH' || !item.docType) &&
               isOwnedByUser(item, authUser.userId) &&
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
      const authUser = await enforceAuth();
      if (authUser.statusCode) return authUser;

      const data = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
      const items = (data.Items || [])
        .filter(item => item.docType === 'PLAYER' && isOwnedByUser(item, authUser.userId))
        .map(item => item.payload || item);
      return response(200, items);
    }

    if (method === 'POST' && path === '/players') {
      const authUser = await enforceAuth();
      if (authUser.statusCode) return authUser;

      const payload = JSON.parse(event.body || '{}');
      const playerId = payload.id || `gp_${Date.now()}`;
      payload.id = playerId;
      payload.ownerUserId = authUser.userId;

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          matchId: playerId,
          docType: 'PLAYER',
          ownerUserId: authUser.userId,
          updatedAt: new Date().toISOString(),
          payload
        }
      }));
      return response(201, payload);
    }

    if (method === 'DELETE' && path.startsWith('/players/') && pathParams.id) {
      const authUser = await enforceAuth();
      if (authUser.statusCode) return authUser;

      // docType protection: Refuse unless item exists and is docType === 'PLAYER'
      const existing = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { matchId: pathParams.id }
      }));

      if (!existing.Item || existing.Item.docType !== 'PLAYER') {
        return response(404, { error: 'Player not found' });
      }
      if (!isOwnedByUser(existing.Item, authUser.userId)) {
        return response(403, { error: 'Forbidden' });
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
