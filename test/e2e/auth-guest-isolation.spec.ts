import { test, expect } from '@playwright/test';
import http from 'node:http';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

process.env.JWT_SECRET = 'test_jwt_secret_key_64_bytes_long_mock_secret_string_1234567890_abcdef';
process.env.TABLE_NAME = 'CricMatches';
process.env.ENFORCE_EMAIL_DOMAIN_DNS = 'false';

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

  test('Signed-in Web scoring stays local and does not write match data to cloud', async ({ page }) => {
    await page.addInitScript(apiUrl => {
      (window as any).CRIC_API_BASE = apiUrl;
    }, API_BASE_URL);
    await page.goto('http://localhost:8080');

    const matchId = `web_local_${Date.now()}`;
    const localMatch = await page.evaluate(async ({ apiUrl, id }) => {
      const win = window as any;
      win.CRIC_API_BASE = apiUrl;
      await win.CricStorage.register(`web_local_${Date.now()}@nrkmart.in`, 'LocalScorePassword123!', 'Local Scorer');
      const match = await win.CricStorage.createMatch({
        id,
        status: 'LIVE',
        teamA: { id: 'local_a', name: 'Local A', players: [] },
        teamB: { id: 'local_b', name: 'Local B', players: [] },
        ballHistory: [],
        totalRuns: 0
      });
      const recalculated = win.ScoringEngine.recalculateMatch(match);
      await win.CricStorage.saveMatch({ ...recalculated, totalRuns: 4 });
      return win.CricStorage.getLocalMatchById(id);
    }, { apiUrl: API_BASE_URL, id: matchId });

    expect(localMatch.localOnly).toBe(true);
    expect(localMatch.totalRuns).toBe(4);
    expect(mockDb.has(matchId)).toBe(false);
  });

  test('Owner-scoped cloud matches are read-only in the Web scoring UI', async ({ page }) => {
    await page.addInitScript(apiUrl => {
      (window as any).CRIC_API_BASE = apiUrl;
    }, API_BASE_URL);
    await page.goto('http://localhost:8080');

    const matchId = `web_cloud_readonly_${Date.now()}`;
    const state = await page.evaluate(async ({ apiUrl, id }) => {
      const win = window as any;
      win.CRIC_API_BASE = apiUrl;
      await win.CricStorage.register(`cloud_view_${Date.now()}@nrkmart.in`, 'CloudViewPassword123!', 'Cloud Viewer');
      const token = localStorage.getItem('cric_auth_token');
      let matchWriteRequests = 0;
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), window.location.href);
        if (url.pathname.startsWith('/matches') && ['POST', 'PUT', 'DELETE'].includes((init?.method || 'GET').toUpperCase())) {
          matchWriteRequests++;
        }
        return originalFetch(input, init);
      };
      const response = await originalFetch(`${apiUrl}/matches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          id,
          status: 'LIVE',
          revision: 1,
          currentInnings: 1,
          totalRuns: 0,
          totalWickets: 0,
          totalBalls: 0,
          oversPerInnings: 6,
          teamA: { id: 'cloud_a', name: 'Cloud A', players: [] },
          teamB: { id: 'cloud_b', name: 'Cloud B', players: [] },
          battingTeamId: 'cloud_a',
          bowlingTeamId: 'cloud_b',
          ballHistory: [],
          wicketHistory: []
        })
      });
      if (!response.ok) throw new Error(`Unable to seed cloud match: ${response.status}`);
      await win.selectMatch(id);
      return {
        scoringKeypadHidden: (document.getElementById('scoringKeypad') as HTMLElement | null)?.style.display === 'none',
        localOnly: win.activeMatch?.localOnly === true,
        matchWriteRequests
      };
    }, { apiUrl: API_BASE_URL, id: matchId });

    expect(state.scoringKeypadHidden).toBe(true);
    expect(state.localOnly).toBe(false);
    expect(state.matchWriteRequests).toBe(0);
    await expect(page.locator('#scoringKeypad')).toBeHidden();
  });

  test('Pending cloud writes survive expired credentials for retry after sign-in', async ({ page }) => {
    await page.addInitScript(apiUrl => {
      (window as any).CRIC_API_BASE = apiUrl;
    }, API_BASE_URL);
    await page.goto('http://localhost:8080');

    const pendingCount = await page.evaluate(async apiUrl => {
      const win = window as any;
      win.CRIC_API_BASE = apiUrl;
      await win.CricStorage.register(`pending_retry_${Date.now()}@nrkmart.in`, 'RetryQueuePassword123!', 'Retry User');
      localStorage.setItem('cric_auth_token', 'expired-token');
      win.CricStorage.queuePendingSync('PUT', '/matches/pending_retry_match', { id: 'pending_retry_match' });
      await win.CricStorage.processPendingSyncQueue();
      const raw = win.CricStorage.readScopedDataValue('cric_pending_sync');
      return raw ? JSON.parse(raw).length : 0;
    }, API_BASE_URL);

    expect(pendingCount).toBe(1);
  });

  test('Signed-out local workspace cannot read the signed-in account cache', async ({ page }) => {
    await page.addInitScript(apiUrl => {
      (window as any).CRIC_API_BASE = apiUrl;
    }, API_BASE_URL);

    await page.goto('http://localhost:8080');

    // Register test user
    const user = await page.evaluate(async (apiUrl) => {
      const win = window as any;
      win.CRIC_API_BASE = apiUrl;
      const res = await win.CricStorage.register(
        `user_isolation_${Date.now()}@gmail.com`,
        'SecretPassword123!',
        'User Isolation'
      );
      if (typeof win.updateAuthUI === 'function') win.updateAuthUI();
      const scopedKey = win.CricStorage.getScopedDataKey('cric_matches');
      localStorage.setItem(scopedKey, JSON.stringify([
        { id: 'account_only_match', teamA: { name: 'Private A' }, teamB: { name: 'Private B' } }
      ]));
      return { user: res, scopedKey };
    }, API_BASE_URL);

    expect(user.user?.userId).toBeTruthy();
    await expect(page.locator('#homeDashboard')).toBeVisible();
    await expect(page.locator('#homeRecentMatches')).toContainText('No saved matches yet');

    // Auto-confirm window.confirm dialogs during Sign Out
    page.on('dialog', dialog => dialog.accept());

    // Sign out through actual UI
    await page.click('#authBtn');

    // Assert landing screen is visible
    const landingScreen = page.locator('#screenLanding');
    await expect(landingScreen).toBeVisible();

    const guestState = await page.evaluate(scopedKey => ({
      guestMatches: (window as any).CricStorage.getLocalMatchesSnapshot(),
      accountMatches: localStorage.getItem(scopedKey)
    }), user.scopedKey);
    expect(guestState.guestMatches).toEqual([]);
    expect(guestState.accountMatches).toContain('account_only_match');
  });

  test('Genuine guest user match data is retained when continuing guest session', async ({ page }) => {
    await page.goto('http://localhost:8080');

    // Create a local Guest match
    await page.click('button.cric-btn:has-text("Quick Match")');

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
      return (window as any).CricStorage.getLocalMatchesSnapshot();
    });

    expect(guestMatches.length).toBeGreaterThan(0);
    expect(guestMatches[0].teamA.name).toBe('Pure Guest A');
  });

});
