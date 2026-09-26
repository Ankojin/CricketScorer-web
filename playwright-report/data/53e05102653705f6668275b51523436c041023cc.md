# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: spectator.spec.ts >> CricScore Pro Spectator Read-Only & Live Sync E2E Tests >> Registered scorer uploads match to API, spectator fetches purely via GET /matches/{id} network calls, and score syncs live
- Location: test\e2e\spectator.spec.ts:126:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#tossModal')
Expected: visible
Received: hidden
Timeout:  10000ms

Call log:
  - Expect "toBeVisible" locator('#tossModal') with timeout 10000ms
  - waiting for locator('#tossModal')
    23 × locator resolved to <div id="tossModal" class="modal-overlay">…</div>
       - unexpected value "hidden"

```

```yaml
- banner:
  - button "CricScore Pro home":
    - img "CricScore Pro Logo"
    - text: CricScore Pro
  - button "✨ Features ▾"
  - button "🔑 Sign In"
  - button "⚙️ Settings"
  - text: 🟢 Sync Active
- img "CricScore Pro App Icon"
- heading "CricScore Pro" [level=2]
- paragraph: Professional Cricket Scorer & Live Scoreboard
- button "📝 Register / Sign In"
- button "👤 Continue as Guest"
- text: "Registered Users: Matches, Series, and Player stats persist permanently. Guest Users: Offline scoring stored temporarily in local storage."
```

# Test source

```ts
  83  |           }
  84  | 
  85  |           const event = {
  86  |             requestContext: {
  87  |               http: { method: req.method || 'GET' }
  88  |             },
  89  |             httpMethod: req.method || 'GET',
  90  |             rawPath,
  91  |             path: rawPath,
  92  |             pathParameters,
  93  |             headers,
  94  |             body: body || null
  95  |           };
  96  | 
  97  |           try {
  98  |             const result = await handler(event);
  99  |             res.writeHead(result.statusCode || 200, {
  100 |               'Content-Type': 'application/json',
  101 |               'Access-Control-Allow-Origin': '*'
  102 |             });
  103 |             res.end(result.body || '');
  104 |           } catch (err: any) {
  105 |             res.writeHead(500, { 'Content-Type': 'application/json' });
  106 |             res.end(JSON.stringify({ error: err.message }));
  107 |           }
  108 |         });
  109 |       });
  110 | 
  111 |       apiServer.listen(API_PORT, () => {
  112 |         resolve();
  113 |       });
  114 |     });
  115 |   });
  116 | 
  117 |   test.afterAll(async () => {
  118 |     if (apiServer) {
  119 |       if (typeof (apiServer as any).closeAllConnections === 'function') {
  120 |         (apiServer as any).closeAllConnections();
  121 |       }
  122 |       await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  123 |     }
  124 |   });
  125 | 
  126 |   test('Registered scorer uploads match to API, spectator fetches purely via GET /matches/{id} network calls, and score syncs live', async ({ browser }) => {
  127 |     // ------------------- 1. SCORER SESSION (REGISTERED USER) -------------------
  128 |     const scorerContext = await browser.newContext();
  129 |     await scorerContext.addInitScript(apiUrl => {
  130 |       (window as any).CRIC_API_BASE = apiUrl;
  131 |     }, API_BASE_URL);
  132 | 
  133 |     const scorerPage = await scorerContext.newPage();
  134 |     await scorerPage.goto('http://localhost:8080');
  135 | 
  136 |     // Register a real test user via CricStorage.register to establish auth token and Cloud Sync
  137 |     const regSuccess = await scorerPage.evaluate(async (apiUrl) => {
  138 |       const win = window as any;
  139 |       win.CRIC_API_BASE = apiUrl;
  140 |       const res = await win.CricStorage.register(
  141 |         `registered_scorer_${Date.now()}@example.com`,
  142 |         'SecretPassword123!',
  143 |         'Registered Scorer'
  144 |       );
  145 |       if (typeof win.updateAuthUI === 'function') win.updateAuthUI();
  146 |       return res;
  147 |     }, API_BASE_URL);
  148 | 
  149 |     expect(regSuccess?.userId).toBeTruthy();
  150 | 
  151 |     // Navigate to Create Match screen
  152 |     await scorerPage.evaluate(() => {
  153 |       const win = window as any;
  154 |       if (typeof win.showNewMatchScreen === 'function') {
  155 |         win.showNewMatchScreen();
  156 |       }
  157 |     });
  158 | 
  159 |     await scorerPage.evaluate(async () => {
  160 |       const win = window as any;
  161 |       const elA = document.getElementById('teamAName') as HTMLInputElement | null;
  162 |       const elB = document.getElementById('teamBName') as HTMLInputElement | null;
  163 |       if (elA) elA.value = 'Cloud Rockets';
  164 |       if (elB) elB.value = 'Cloud Thunder';
  165 | 
  166 |       if (typeof win.addPlayerObjectToSquad === 'function') {
  167 |         win.addPlayerObjectToSquad('A', { id: 'pa_1', name: 'AlphaStriker' });
  168 |         win.addPlayerObjectToSquad('A', { id: 'pa_2', name: 'AlphaNonStriker' });
  169 |         win.addPlayerObjectToSquad('B', { id: 'pb_1', name: 'BetaBowler' });
  170 |       }
  171 | 
  172 |       if (typeof win.renderSquadList === 'function') {
  173 |         win.renderSquadList('A');
  174 |         win.renderSquadList('B');
  175 |       }
  176 | 
  177 |       if (typeof win.handleCreateMatch === 'function') {
  178 |         await win.handleCreateMatch();
  179 |       }
  180 |     });
  181 | 
  182 |     const tossModal = scorerPage.locator('#tossModal');
> 183 |     await expect(tossModal).toBeVisible();
      |                             ^ Error: expect(locator).toBeVisible() failed
  184 | 
  185 |     await scorerPage.click('#tossModal button:has-text("Start match")');
  186 | 
  187 |     // Handle initial player prompts
  188 |     for (let i = 0; i < 3; i++) {
  189 |       const selectionModal = scorerPage.locator('#selectionModal');
  190 |       if (await selectionModal.isVisible()) {
  191 |         const confirmBtn = scorerPage.locator('#btnConfirmGenericSelection');
  192 |         if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
  193 |           await confirmBtn.click();
  194 |         } else {
  195 |           const bowlerOpt = scorerPage.locator('#bowlerListContainer .bowler-option').first();
  196 |           if (await bowlerOpt.isVisible()) {
  197 |             await bowlerOpt.click();
  198 |           }
  199 |         }
  200 |         await scorerPage.waitForTimeout(300);
  201 |       }
  202 |     }
  203 | 
  204 |     // Score Ball 1: 4 runs
  205 |     await scorerPage.click('#scoringKeypad button:has-text("4")');
  206 |     await expect(scorerPage.locator('#scoreMain')).toHaveText('4/0');
  207 | 
  208 |     // Score Ball 2: 6 runs (Total: 10/0)
  209 |     await scorerPage.click('#scoringKeypad button:has-text("6")');
  210 |     await expect(scorerPage.locator('#scoreMain')).toHaveText('10/0');
  211 | 
  212 |     const matchId = await scorerPage.evaluate(() => {
  213 |       return (window as any).activeMatch?.id || localStorage.getItem('cric_active_match_id');
  214 |     });
  215 | 
  216 |     expect(matchId).toBeTruthy();
  217 | 
  218 |     // ------------------- 2. SPECTATOR SESSION (PURE NETWORK FETCH) -------------------
  219 |     // Open a fresh browser context WITHOUT copying any localStorage
  220 |     const spectatorContext = await browser.newContext();
  221 |     await spectatorContext.addInitScript(apiUrl => {
  222 |       (window as any).CRIC_API_BASE = apiUrl;
  223 |     }, API_BASE_URL);
  224 | 
  225 |     const spectatorPage = await spectatorContext.newPage();
  226 | 
  227 |     // Track network requests to ensure spectator only reads and NEVER mutates API
  228 |     const mutatingRequests: string[] = [];
  229 |     spectatorPage.on('request', request => {
  230 |       const method = request.method();
  231 |       if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
  232 |         mutatingRequests.push(`${method} ${request.url()}`);
  233 |       }
  234 |     });
  235 | 
  236 |     // Navigate spectator directly to ?matchId=<matchId>
  237 |     await spectatorPage.goto(`http://localhost:8080/?matchId=${matchId}`);
  238 | 
  239 |     // Assert Spectator Banner is VISIBLE
  240 |     const spectatorBanner = spectatorPage.locator('#spectatorBanner');
  241 |     await expect(spectatorBanner).toBeVisible();
  242 |     await expect(spectatorBanner).toContainText('Spectator Live Viewer Mode');
  243 | 
  244 |     // Assert Scoring Keypad is HIDDEN
  245 |     const scoringKeypad = spectatorPage.locator('#scoringKeypad');
  246 |     await expect(scoringKeypad).toBeHidden();
  247 | 
  248 |     // Assert Spectator fetches and displays initial live score 10/0 from API
  249 |     await expect(spectatorPage.locator('#scoreMain')).toHaveText('10/0');
  250 | 
  251 |     // ------------------- 3. LIVE POLLING SCORE SYNC -------------------
  252 |     // Scorer scores Ball 3: 4 runs -> Total 14/0
  253 |     await scorerPage.click('#scoringKeypad button:has-text("4")');
  254 |     await expect(scorerPage.locator('#scoreMain')).toHaveText('14/0');
  255 | 
  256 |     // Wait for spectator 5-second polling interval
  257 |     await spectatorPage.waitForTimeout(6500);
  258 | 
  259 |     // Assert Spectator score automatically updates to 14/0 purely via network GET
  260 |     await expect(spectatorPage.locator('#scoreMain')).toHaveText('14/0');
  261 | 
  262 |     // Assert spectator session issued ZERO mutating requests
  263 |     expect(mutatingRequests).toEqual([]);
  264 | 
  265 |     await scorerContext.close();
  266 |     await spectatorContext.close();
  267 |   });
  268 | 
  269 |   test('Guest scorer calling goLiveShare is blocked with sign-in warning and opens no spectator link', async ({ page, context }) => {
  270 |     await page.goto('http://localhost:8080');
  271 | 
  272 |     // Continue as Guest
  273 |     const guestBtn = page.locator('button:has-text("Continue as Guest")');
  274 |     if (await guestBtn.isVisible()) {
  275 |       await guestBtn.click();
  276 |     }
  277 | 
  278 |     // Create a Guest match
  279 |     await page.click('button:visible:has-text("Quick Match")');
  280 | 
  281 |     await page.evaluate(async () => {
  282 |       const win = window as any;
  283 |       const elA = document.getElementById('teamAName') as HTMLInputElement | null;
```