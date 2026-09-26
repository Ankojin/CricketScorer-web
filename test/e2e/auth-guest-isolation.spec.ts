import { test, expect } from '@playwright/test';
import http from 'node:http';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

process.env.JWT_SECRET = 'test_jwt_secret_key_64_bytes_long_mock_secret_string_1234567890_abcdef';
process.env.TABLE_NAME = 'CricMatches';

const mockDb = new Map<string, any>();

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
const API_PORT = 3002;
const API_BASE_URL = `http://localhost:${API_PORT}`;

test.describe('Account Logout & Guest Mode Data Isolation E2E Tests', () => {

  test.beforeAll(async () => {
    mockDb.clear();
    await new Promise<void>((resolve) => {
      apiServer = http.createServer(async (req, res) => {
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

  test('Registered account data is purged on sign-out, leaving Guest mode clean', async ({ page }) => {
    await page.addInitScript(apiUrl => {
      (window as any).CRIC_API_BASE = apiUrl;
    }, API_BASE_URL);

    await page.goto('http://localhost:8080');

    // Register test user
    const user = await page.evaluate(async (apiUrl) => {
      const win = window as any;
      win.CRIC_API_BASE = apiUrl;
      const res = await win.CricStorage.register(
        `user_isolation_${Date.now()}@example.com`,
        'SecretPassword123!',
        'User Isolation'
      );
      if (typeof win.updateAuthUI === 'function') win.updateAuthUI();
      return res;
    }, API_BASE_URL);

    expect(user?.userId).toBeTruthy();

    // Navigate to Create Match screen
    await page.evaluate(async () => {
      const win = window as any;
      if (typeof win.showNewMatchScreen === 'function') {
        await win.showNewMatchScreen();
      }
    });

    // Create match as registered user
    await page.evaluate(async () => {
      const win = window as any;
      const elA = document.getElementById('teamAName') as HTMLInputElement | null;
      const elB = document.getElementById('teamBName') as HTMLInputElement | null;
      if (elA) elA.value = 'Isolation Rockets';
      if (elB) elB.value = 'Isolation Thunder';

      if (typeof win.addPlayerObjectToSquad === 'function') {
        win.addPlayerObjectToSquad('A', { id: 'pa_1', name: 'AliceIso' });
        win.addPlayerObjectToSquad('A', { id: 'pa_2', name: 'AmyIso' });
        win.addPlayerObjectToSquad('B', { id: 'pb_1', name: 'BobIso' });
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

    // Confirm initial selection prompts
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

    // Verify match exists in localStorage
    const matchesBeforeSignout = await page.evaluate(() => {
      const raw = localStorage.getItem('cric_matches');
      return raw ? JSON.parse(raw) : [];
    });
    expect(matchesBeforeSignout.length).toBeGreaterThan(0);

    // Auto-confirm window.confirm dialogs during Sign Out
    page.on('dialog', dialog => dialog.accept());

    // Sign out through actual UI
    await page.click('#authBtn');

    // Assert landing screen is visible
    const landingScreen = page.locator('#screenLanding');
    await expect(landingScreen).toBeVisible();

    // Click Continue as Guest
    await page.click('button:has-text("Continue as Guest")');

    // Assert match list is empty ("No matches found" or 0 matches)
    const matchesAfterGuestSwitch = await page.evaluate(() => {
      const raw = localStorage.getItem('cric_matches');
      return raw ? JSON.parse(raw) : [];
    });
    expect(matchesAfterGuestSwitch.length).toBe(0);

    // Assert cached collections in localStorage are null/empty
    const storageState = await page.evaluate(() => ({
      cric_matches: localStorage.getItem('cric_matches'),
      cric_teams: localStorage.getItem('cric_teams'),
      cric_tournaments: localStorage.getItem('cric_tournaments'),
      cric_global_players: localStorage.getItem('cric_global_players'),
      cric_active_match_id: localStorage.getItem('cric_active_match_id')
    }));

    expect(storageState.cric_matches).toBeNull();
    expect(storageState.cric_teams).toBeNull();
    expect(storageState.cric_tournaments).toBeNull();
    expect(storageState.cric_global_players).toBeNull();
    expect(storageState.cric_active_match_id).toBeNull();
  });

  test('Genuine guest user match data is retained when continuing guest session', async ({ page }) => {
    await page.goto('http://localhost:8080');

    // Continue as Guest
    const guestBtn = page.locator('button:has-text("Continue as Guest")');
    if (await guestBtn.isVisible()) {
      await guestBtn.click();
    }

    // Create a local Guest match
    await page.click('button:has-text("Quick Match")');

    await page.evaluate(async () => {
      const win = window as any;
      const elA = document.getElementById('teamAName') as HTMLInputElement | null;
      const elB = document.getElementById('teamBName') as HTMLInputElement | null;
      if (elA) elA.value = 'Pure Guest A';
      if (elB) elB.value = 'Pure Guest B';

      if (typeof win.addPlayerObjectToSquad === 'function') {
        win.addPlayerObjectToSquad('A', { id: 'p_pg1', name: 'PureGuestStriker' });
        win.addPlayerObjectToSquad('A', { id: 'p_pg2', name: 'PureGuestNonStriker' });
        win.addPlayerObjectToSquad('B', { id: 'p_pg3', name: 'PureGuestBowler' });
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

    // Confirm initial selection prompts
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

    // Score 1 ball to ensure match has data
    await page.click('#scoringKeypad button:has-text("1")');

    // Navigate back to Landing screen
    await page.evaluate(() => {
      const win = window as any;
      if (typeof win.showLandingScreen === 'function') {
        win.showLandingScreen();
      }
    });

    // Returning home in Guest mode must keep the saved match visible.
    await expect(page.locator('#homeDashboard')).toBeVisible();
    await expect(page.locator('#homeRecentMatches')).toContainText('Pure Guest A vs Pure Guest B');

    // Assert Guest match data is NOT wiped
    const guestMatches = await page.evaluate(() => {
      const raw = localStorage.getItem('cric_matches');
      return raw ? JSON.parse(raw) : [];
    });

    expect(guestMatches.length).toBeGreaterThan(0);
    expect(guestMatches[0].teamA.name).toBe('Pure Guest A');
  });

});
