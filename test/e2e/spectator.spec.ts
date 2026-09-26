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
          const rawPath = req.url?.split('?')[0] || '/';
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
            path: rawPath,
            pathParameters,
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
        `registered_scorer_${Date.now()}@example.com`,
        'SecretPassword123!',
        'Registered Scorer'
      );
      if (typeof win.updateAuthUI === 'function') win.updateAuthUI();
      return res;
    }, API_BASE_URL);

    expect(regSuccess?.userId).toBeTruthy();

    // Navigate to Create Match screen
    await scorerPage.evaluate(async () => {
      const win = window as any;
      if (typeof win.showNewMatchScreen === 'function') {
        await win.showNewMatchScreen();
      }
    });

    await scorerPage.evaluate(async () => {
      const win = window as any;
      const elA = document.getElementById('teamAName') as HTMLInputElement | null;
      const elB = document.getElementById('teamBName') as HTMLInputElement | null;
      if (elA) elA.value = 'Cloud Rockets';
      if (elB) elB.value = 'Cloud Thunder';

      if (typeof win.addPlayerObjectToSquad === 'function') {
        win.addPlayerObjectToSquad('A', { id: 'pa_1', name: 'AlphaStriker' });
        win.addPlayerObjectToSquad('A', { id: 'pa_2', name: 'AlphaNonStriker' });
        win.addPlayerObjectToSquad('B', { id: 'pb_1', name: 'BetaBowler' });
      }

      if (typeof win.renderSquadList === 'function') {
        win.renderSquadList('A');
        win.renderSquadList('B');
      }

      if (typeof win.handleCreateMatch === 'function') {
        await win.handleCreateMatch();
      }
    });

    const tossModal = scorerPage.locator('#tossModal');
    await expect(tossModal).toBeVisible();

    await scorerPage.click('#tossModal button:has-text("Start match")');

    // Handle initial player prompts
    for (let i = 0; i < 3; i++) {
      const selectionModal = scorerPage.locator('#selectionModal');
      if (await selectionModal.isVisible()) {
        const confirmBtn = scorerPage.locator('#btnConfirmGenericSelection');
        if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
          await confirmBtn.click();
        } else {
          const bowlerOpt = scorerPage.locator('#bowlerListContainer .bowler-option').first();
          if (await bowlerOpt.isVisible()) {
            await bowlerOpt.click();
          }
        }
        await scorerPage.waitForTimeout(300);
      }
    }

    // Score Ball 1: 4 runs
    await scorerPage.click('#scoringKeypad button:has-text("4")');
    await expect(scorerPage.locator('#scoreMain')).toHaveText('4/0');

    // Score Ball 2: 6 runs (Total: 10/0)
    await scorerPage.click('#scoringKeypad button:has-text("6")');
    await expect(scorerPage.locator('#scoreMain')).toHaveText('10/0');

    const matchId = await scorerPage.evaluate(() => {
      return (window as any).activeMatch?.id || localStorage.getItem('cric_active_match_id');
    });

    expect(matchId).toBeTruthy();

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

    // Navigate spectator directly to ?matchId=<matchId>
    await spectatorPage.goto(`http://localhost:8080/?matchId=${matchId}`);

    // Assert Spectator Banner is VISIBLE
    const spectatorBanner = spectatorPage.locator('#spectatorBanner');
    await expect(spectatorBanner).toBeVisible();
    await expect(spectatorBanner).toContainText('Spectator Live Viewer Mode');

    // Assert Scoring Keypad is HIDDEN
    const scoringKeypad = spectatorPage.locator('#scoringKeypad');
    await expect(scoringKeypad).toBeHidden();

    // Assert Spectator fetches and displays initial live score 10/0 from API
    await expect(spectatorPage.locator('#scoreMain')).toHaveText('10/0');

    // ------------------- 3. LIVE POLLING SCORE SYNC -------------------
    // Scorer scores Ball 3: 4 runs -> Total 14/0
    await scorerPage.click('#scoringKeypad button:has-text("4")');
    await expect(scorerPage.locator('#scoreMain')).toHaveText('14/0');

    // Wait for spectator 5-second polling interval
    await spectatorPage.waitForTimeout(6500);

    // Assert Spectator score automatically updates to 14/0 purely via network GET
    await expect(spectatorPage.locator('#scoreMain')).toHaveText('14/0');

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

    // Create a Guest match
    await page.click('button:has-text("Quick Match")');

    await page.evaluate(async () => {
      const win = window as any;
      const elA = document.getElementById('teamAName') as HTMLInputElement | null;
      const elB = document.getElementById('teamBName') as HTMLInputElement | null;
      if (elA) elA.value = 'Guest Team A';
      if (elB) elB.value = 'Guest Team B';

      if (typeof win.addPlayerObjectToSquad === 'function') {
        win.addPlayerObjectToSquad('A', { id: 'p_g1', name: 'GuestStriker' });
        win.addPlayerObjectToSquad('A', { id: 'p_g2', name: 'GuestNonStriker' });
        win.addPlayerObjectToSquad('B', { id: 'p_g3', name: 'GuestBowler' });
      }

      if (typeof win.renderSquadList === 'function') {
        win.renderSquadList('A');
        win.renderSquadList('B');
      }

      if (typeof win.handleCreateMatch === 'function') {
        await win.handleCreateMatch();
      }
    });

    const tossModal = page.locator('#tossModal');
    await expect(tossModal).toBeVisible();

    await page.click('#tossModal button:has-text("Start match")');

    // Handle initial player selection prompts
    for (let i = 0; i < 3; i++) {
      const selectionModal = page.locator('#selectionModal');
      if (await selectionModal.isVisible()) {
        const confirmBtn = page.locator('#btnConfirmGenericSelection');
        if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
          await confirmBtn.click();
        } else {
          const bowlerOpt = page.locator('#bowlerListContainer .bowler-option').first();
          if (await bowlerOpt.isVisible()) {
            await bowlerOpt.click();
          }
        }
        await page.waitForTimeout(300);
      }
    }

    // Track popup / new tab creation
    let popupOpened = false;
    context.on('page', () => {
      popupOpened = true;
    });

    // Attempt to click Share Live Score button in Guest Mode
    await page.locator('#liveMoreMenu > summary').click();
    await page.click('#shareWhatsAppBtn');

    // Assert NO new popup/tab was opened
    expect(popupOpened).toBe(false);

    // Assert Toast warning is displayed indicating sign-in is required
    const toast = page.locator('.toast', { hasText: 'Sign in to share live scores across devices' });
    await expect(toast).toBeVisible();
  });

});
