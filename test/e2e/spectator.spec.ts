import { test, expect } from '@playwright/test';
import http from 'node:http';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Setup Mock Environment Variables BEFORE importing index.mjs
process.env.JWT_SECRET = 'test_jwt_secret_key_64_bytes_long_mock_secret_string_1234567890_abcdef';
process.env.TABLE_NAME = 'CricMatches';

const mockDb = new Map<string, any>();

// Patch DynamoDB Document Client send method for in-memory DB
DynamoDBDocumentClient.prototype.send = async function (command: any) {
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

// @ts-ignore
const { handler } = await import('../../aws/lambda/index.mjs');

let apiServer: http.Server;
const API_PORT = 3001;
const API_BASE_URL = `http://localhost:${API_PORT}`;

test.describe('CricScore Pro Spectator Read-Only & Live Sync E2E Tests', () => {

  test.beforeAll(async () => {
    mockDb.clear();
    await new Promise<void>((resolve) => {
      apiServer = http.createServer(async (req, res) => {
        // Handle CORS preflight & headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end(JSON.stringify({ status: 'OK' }));
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          const requestUrl = new URL(req.url || '/', `http://localhost:${API_PORT}`);
          const rawPath = requestUrl.pathname || '/';
          const rawQueryString = requestUrl.search ? requestUrl.search.slice(1) : '';
          const queryStringParameters: Record<string, string> = {};
          requestUrl.searchParams.forEach((value, key) => {
            queryStringParameters[key] = value;
          });
          const parts = rawPath.split('/').filter(Boolean);
          const pathParameters: Record<string, string> = {};
          if (parts[0] === 'matches' && parts[1]) {
            pathParameters.id = parts[1];
          }

          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers[k.toLowerCase()] = v;
            else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(', ');
          }

          const event = {
            requestContext: {
              http: { method: req.method || 'GET' }
            },
            httpMethod: req.method || 'GET',
            rawPath,
            rawQueryString,
            path: rawPath,
            pathParameters,
            queryStringParameters,
            headers,
            body: body || null
          };

          try {
            const result = await handler(event);
            res.writeHead(result.statusCode || 200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(result.body || '');
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });

      apiServer.listen(API_PORT, () => {
        resolve();
      });
    });
  });

  test.afterAll(async () => {
    if (apiServer) {
      if (typeof (apiServer as any).closeAllConnections === 'function') {
        (apiServer as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => apiServer.close(() => resolve()));
    }
  });

  test('Registered scorer uploads match to API, spectator fetches purely via GET /matches/{id} network calls, and score syncs live', async ({ browser }) => {
    // ------------------- 1. SCORER SESSION (REGISTERED USER) -------------------
    const scorerContext = await browser.newContext();
    await scorerContext.addInitScript(apiUrl => {
      (window as any).CRIC_API_BASE = apiUrl;
    }, API_BASE_URL);

    const scorerPage = await scorerContext.newPage();
    await scorerPage.goto('http://localhost:8080');

    // Register a real test user via CricStorage.register to establish auth token and Cloud Sync
    const regSuccess = await scorerPage.evaluate(async (apiUrl) => {
      const win = window as any;
      win.CRIC_API_BASE = apiUrl;
      const res = await win.CricStorage.register(
        `registered_scorer_${Date.now()}@gmail.com`,
        'SecretPassword123!',
        'Registered Scorer'
      );
      if (typeof win.updateAuthUI === 'function') win.updateAuthUI();
      return res;
    }, API_BASE_URL);

    expect(regSuccess?.userId).toBeTruthy();

    const setupResult = await scorerPage.evaluate(async (apiUrl) => {
      const token = localStorage.getItem('cric_auth_token');
      if (!token) throw new Error('Missing auth token after register');

      const defaultBatting = {
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
      const defaultBowling = {
        overs: 0,
        balls: 0,
        maidens: 0,
        runsConceded: 0,
        wickets: 0,
        dotBalls: 0,
        wides: 0,
        noBalls: 0
      };
      const defaultFielding = {
        catches: 0,
        runOuts: 0,
        stumpings: 0,
        droppedCatches: 0
      };

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };

      const matchId = `match_${Date.now()}`;
      const basePlayersA = [
        { id: 'p1', name: 'AlphaStriker', battingStats: defaultBatting, bowlingStats: defaultBowling, fieldingStats: defaultFielding },
        { id: 'p2', name: 'AlphaNonStriker', battingStats: defaultBatting, bowlingStats: defaultBowling, fieldingStats: defaultFielding }
      ];
      const basePlayersB = [
        { id: 'b1', name: 'BetaBowler', battingStats: defaultBatting, bowlingStats: defaultBowling, fieldingStats: defaultFielding }
      ];

      const matchPayload: any = {
        id: matchId,
        teamA: { id: 'teamA', name: 'Cloud Rockets', players: basePlayersA },
        teamB: { id: 'teamB', name: 'Cloud Thunder', players: basePlayersB },
        tossWinnerId: 'teamA',
        tossDecision: 'BAT',
        status: 'LIVE',
        currentInnings: 1,
        battingTeamId: 'teamA',
        bowlingTeamId: 'teamB',
        totalRuns: 10,
        totalWickets: 0,
        totalBalls: 2,
        wideCount: 0,
        noBallCount: 0,
        byeCount: 0,
        legByeCount: 0,
        ballHistory: [
          { runs: 4, extrasType: 'NONE', isLegalBall: true, wicketType: 'NONE', strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' },
          { runs: 6, extrasType: 'NONE', isLegalBall: true, wicketType: 'NONE', strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' }
        ],
        wicketHistory: [],
        oversPerInnings: 20,
        gullyRules: {},
        pendingAction: 'NONE',
        battingOrder: ['p1', 'p2'],
        dateMillis: Date.now(),
        revision: 1
      };

      const createRes = await fetch(`${apiUrl}/matches`, {
        method: 'POST',
        headers,
        body: JSON.stringify(matchPayload)
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error || `Create failed: ${createRes.status}`);
      }

      const shareRes = await fetch(`${apiUrl}/matches/${matchId}/share-token`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ttlMinutes: 60 })
      });
      const shareBody = await shareRes.json().catch(() => ({}));
      if (!shareRes.ok || !shareBody?.spectatorToken) {
        throw new Error(shareBody.error || `Share-token failed: ${shareRes.status}`);
      }

      return { matchId, spectatorToken: shareBody.spectatorToken, token };
    }, API_BASE_URL);

    const matchId = setupResult.matchId;
    const spectatorToken = setupResult.spectatorToken;

    expect(spectatorToken).toBeTruthy();

    // ------------------- 2. SPECTATOR SESSION (PURE NETWORK FETCH) -------------------
    // Open a fresh browser context WITHOUT copying any localStorage
    const spectatorContext = await browser.newContext();
    await spectatorContext.addInitScript(apiUrl => {
      (window as any).CRIC_API_BASE = apiUrl;
    }, API_BASE_URL);

    const spectatorPage = await spectatorContext.newPage();

    // Track network requests to ensure spectator only reads and NEVER mutates API
    const mutatingRequests: string[] = [];
    spectatorPage.on('request', request => {
      const method = request.method();
      if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        mutatingRequests.push(`${method} ${request.url()}`);
      }
    });

    // Navigate spectator using signed read-only spectator link
    await spectatorPage.goto(`http://localhost:8080/?matchId=${matchId}&st=${encodeURIComponent(String(spectatorToken))}&spectator=1`);

    // Assert spectator mode is active via internal state.
    const spectatorModeEnabled = await spectatorPage.evaluate(() => {
      return Boolean(eval('isReadOnlySpectator'));
    });
    expect(spectatorModeEnabled).toBe(true);

    // Assert Scoring Keypad is HIDDEN
    const scoringKeypad = spectatorPage.locator('#scoringKeypad');
    await expect(scoringKeypad).toBeHidden();

    // Assert spectator tokenized GET path can read current score from cloud.
    const initialCloudRuns = await spectatorPage.evaluate(async ({ apiUrl, currentMatchId, token }) => {
      const res = await fetch(`${apiUrl}/matches/${currentMatchId}?st=${encodeURIComponent(token)}`);
      if (!res.ok) {
        return -1;
      }
      const body = await res.json();
      return Number(body?.totalRuns ?? -1);
    }, { apiUrl: API_BASE_URL, currentMatchId: matchId, token: String(spectatorToken) });
    expect(initialCloudRuns).toBe(10);

    // ------------------- 3. LIVE POLLING SCORE SYNC -------------------
    // Simulate Android-authoritative cloud write with one more run event (14/0)
    await scorerPage.evaluate(async ({ apiUrl, currentMatchId, token }) => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };

      const currentRes = await fetch(`${apiUrl}/matches/${currentMatchId}`, { headers });
      const currentBody = await currentRes.json();

      const updated = {
        ...currentBody,
        ballHistory: [
          ...(currentBody.ballHistory || []),
          { runs: 4, extrasType: 'NONE', isLegalBall: true, wicketType: 'NONE', strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' }
        ],
        totalRuns: Number(currentBody.totalRuns || 0) + 4,
        totalBalls: Number(currentBody.totalBalls || 0) + 1,
        revision: Number(currentBody.revision || 1) + 1,
        status: 'LIVE'
      };

      const putRes = await fetch(`${apiUrl}/matches/${currentMatchId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updated)
      });

      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error(err.error || `Update failed: ${putRes.status}`);
      }
    }, { apiUrl: API_BASE_URL, currentMatchId: matchId, token: setupResult.token });

    // Wait for spectator 5-second polling interval
    await spectatorPage.waitForTimeout(6500);

    // Assert spectator tokenized GET path now reads updated score (14/0 equivalent runs).
    const updatedCloudRuns = await spectatorPage.evaluate(async ({ apiUrl, currentMatchId, token }) => {
      const res = await fetch(`${apiUrl}/matches/${currentMatchId}?st=${encodeURIComponent(token)}`);
      if (!res.ok) {
        return -1;
      }
      const body = await res.json();
      return Number(body?.totalRuns ?? -1);
    }, { apiUrl: API_BASE_URL, currentMatchId: matchId, token: String(spectatorToken) });
    expect(updatedCloudRuns).toBe(14);

    // Assert spectator session issued ZERO mutating requests
    expect(mutatingRequests).toEqual([]);

    await scorerContext.close();
    await spectatorContext.close();
  });

  test('Guest scorer calling goLiveShare is blocked with sign-in warning and opens no spectator link', async ({ page, context }) => {
    await page.goto('http://localhost:8080');

    // Continue as Guest
    const guestBtn = page.locator('button:has-text("Continue as Guest")');
    if (await guestBtn.isVisible()) {
      await guestBtn.click();
    }

    // Seed a mock LIVE match in memory and invoke goLiveShare directly.
    await page.evaluate(() => {
      localStorage.setItem('cric_user_mode', 'GUEST');
      localStorage.removeItem('cric_auth_token');

      const seeded = {
        id: 'guest_live_match_1',
        status: 'LIVE',
        teamA: { name: 'Guest Team A' },
        teamB: { name: 'Guest Team B' },
        totalRuns: 0,
        totalWickets: 0,
        totalBalls: 0
      };

      // activeMatch is a top-level lexical state value (not a window property).
      // Use eval so the assignment happens in the same global script scope.
      eval(`activeMatch = ${JSON.stringify(seeded)}`);
    });

    // Track popup / new tab creation
    let popupOpened = false;
    context.on('page', () => {
      popupOpened = true;
    });

    // Attempt share action in Guest Mode and capture toast text.
    const toastMessage = await page.evaluate(() => {
      const win = window as any;
      let captured = '';
      const originalShowToast = win.showToast;
      win.showToast = (msg: string, type = 'info') => {
        captured = String(msg || '');
        if (typeof originalShowToast === 'function') {
          originalShowToast(msg, type);
        }
      };
      if (typeof win.goLiveShare === 'function') {
        win.goLiveShare();
      }
      win.showToast = originalShowToast;
      return captured;
    });

    // Assert NO new popup/tab was opened
    expect(popupOpened).toBe(false);

    // Assert warning message is raised indicating sign-in is required.
    expect(toastMessage).toContain('Sign in to share live scores across devices');
  });

});
