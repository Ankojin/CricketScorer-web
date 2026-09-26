# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-guest-isolation.spec.ts >> Account Logout & Guest Mode Data Isolation E2E Tests >> Registered account data is purged on sign-out, leaving Guest mode clean
- Location: test\e2e\auth-guest-isolation.spec.ts:123:3

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
  78  |             if (typeof v === 'string') headers[k.toLowerCase()] = v;
  79  |             else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(', ');
  80  |           }
  81  | 
  82  |           const event = {
  83  |             requestContext: {
  84  |               http: { method: req.method || 'GET' }
  85  |             },
  86  |             httpMethod: req.method || 'GET',
  87  |             rawPath,
  88  |             path: rawPath,
  89  |             pathParameters,
  90  |             headers,
  91  |             body: body || null
  92  |           };
  93  | 
  94  |           try {
  95  |             const result = await handler(event);
  96  |             res.writeHead(result.statusCode || 200, {
  97  |               'Content-Type': 'application/json',
  98  |               'Access-Control-Allow-Origin': '*'
  99  |             });
  100 |             res.end(result.body || '');
  101 |           } catch (err: any) {
  102 |             res.writeHead(500, { 'Content-Type': 'application/json' });
  103 |             res.end(JSON.stringify({ error: err.message }));
  104 |           }
  105 |         });
  106 |       });
  107 | 
  108 |       apiServer.listen(API_PORT, () => {
  109 |         resolve();
  110 |       });
  111 |     });
  112 |   });
  113 | 
  114 |   test.afterAll(async () => {
  115 |     if (apiServer) {
  116 |       if (typeof (apiServer as any).closeAllConnections === 'function') {
  117 |         (apiServer as any).closeAllConnections();
  118 |       }
  119 |       await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  120 |     }
  121 |   });
  122 | 
  123 |   test('Registered account data is purged on sign-out, leaving Guest mode clean', async ({ page }) => {
  124 |     await page.addInitScript(apiUrl => {
  125 |       (window as any).CRIC_API_BASE = apiUrl;
  126 |     }, API_BASE_URL);
  127 | 
  128 |     await page.goto('http://localhost:8080');
  129 | 
  130 |     // Register test user
  131 |     const user = await page.evaluate(async (apiUrl) => {
  132 |       const win = window as any;
  133 |       win.CRIC_API_BASE = apiUrl;
  134 |       const res = await win.CricStorage.register(
  135 |         `user_isolation_${Date.now()}@example.com`,
  136 |         'SecretPassword123!',
  137 |         'User Isolation'
  138 |       );
  139 |       if (typeof win.updateAuthUI === 'function') win.updateAuthUI();
  140 |       return res;
  141 |     }, API_BASE_URL);
  142 | 
  143 |     expect(user?.userId).toBeTruthy();
  144 | 
  145 |     // Navigate to Create Match screen
  146 |     await page.evaluate(() => {
  147 |       const win = window as any;
  148 |       if (typeof win.showNewMatchScreen === 'function') {
  149 |         win.showNewMatchScreen();
  150 |       }
  151 |     });
  152 | 
  153 |     // Create match as registered user
  154 |     await page.evaluate(async () => {
  155 |       const win = window as any;
  156 |       const elA = document.getElementById('teamAName') as HTMLInputElement | null;
  157 |       const elB = document.getElementById('teamBName') as HTMLInputElement | null;
  158 |       if (elA) elA.value = 'Isolation Rockets';
  159 |       if (elB) elB.value = 'Isolation Thunder';
  160 | 
  161 |       if (typeof win.addPlayerObjectToSquad === 'function') {
  162 |         win.addPlayerObjectToSquad('A', { id: 'pa_1', name: 'AliceIso' });
  163 |         win.addPlayerObjectToSquad('A', { id: 'pa_2', name: 'AmyIso' });
  164 |         win.addPlayerObjectToSquad('B', { id: 'pb_1', name: 'BobIso' });
  165 |       }
  166 | 
  167 |       if (typeof win.renderSquadList === 'function') {
  168 |         win.renderSquadList('A');
  169 |         win.renderSquadList('B');
  170 |       }
  171 | 
  172 |       if (typeof win.handleCreateMatch === 'function') {
  173 |         await win.handleCreateMatch();
  174 |       }
  175 |     });
  176 | 
  177 |     const tossModal = page.locator('#tossModal');
> 178 |     await expect(tossModal).toBeVisible();
      |                             ^ Error: expect(locator).toBeVisible() failed
  179 | 
  180 |     await page.click('#tossModal button:has-text("Start match")');
  181 | 
  182 |     // Confirm initial selection prompts
  183 |     for (let i = 0; i < 3; i++) {
  184 |       const selectionModal = page.locator('#selectionModal');
  185 |       if (await selectionModal.isVisible()) {
  186 |         const confirmBtn = page.locator('#btnConfirmGenericSelection');
  187 |         if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
  188 |           await confirmBtn.click();
  189 |         } else {
  190 |           const bowlerOpt = page.locator('#bowlerListContainer .bowler-option').first();
  191 |           if (await bowlerOpt.isVisible()) {
  192 |             await bowlerOpt.click();
  193 |           }
  194 |         }
  195 |         await page.waitForTimeout(300);
  196 |       }
  197 |     }
  198 | 
  199 |     // Verify match exists in localStorage
  200 |     const matchesBeforeSignout = await page.evaluate(() => {
  201 |       const raw = localStorage.getItem('cric_matches');
  202 |       return raw ? JSON.parse(raw) : [];
  203 |     });
  204 |     expect(matchesBeforeSignout.length).toBeGreaterThan(0);
  205 | 
  206 |     // Auto-confirm window.confirm dialogs during Sign Out
  207 |     page.on('dialog', dialog => dialog.accept());
  208 | 
  209 |     // Sign out through actual UI
  210 |     await page.click('#authBtn');
  211 | 
  212 |     // Assert landing screen is visible
  213 |     const landingScreen = page.locator('#screenLanding');
  214 |     await expect(landingScreen).toBeVisible();
  215 | 
  216 |     // Click Continue as Guest
  217 |     await page.click('button:has-text("Continue as Guest")');
  218 | 
  219 |     // Assert match list is empty ("No matches found" or 0 matches)
  220 |     const matchesAfterGuestSwitch = await page.evaluate(() => {
  221 |       const raw = localStorage.getItem('cric_matches');
  222 |       return raw ? JSON.parse(raw) : [];
  223 |     });
  224 |     expect(matchesAfterGuestSwitch.length).toBe(0);
  225 | 
  226 |     // Assert cached collections in localStorage are null/empty
  227 |     const storageState = await page.evaluate(() => ({
  228 |       cric_matches: localStorage.getItem('cric_matches'),
  229 |       cric_teams: localStorage.getItem('cric_teams'),
  230 |       cric_tournaments: localStorage.getItem('cric_tournaments'),
  231 |       cric_global_players: localStorage.getItem('cric_global_players'),
  232 |       cric_active_match_id: localStorage.getItem('cric_active_match_id')
  233 |     }));
  234 | 
  235 |     expect(storageState.cric_matches).toBeNull();
  236 |     expect(storageState.cric_teams).toBeNull();
  237 |     expect(storageState.cric_tournaments).toBeNull();
  238 |     expect(storageState.cric_global_players).toBeNull();
  239 |     expect(storageState.cric_active_match_id).toBeNull();
  240 |   });
  241 | 
  242 |   test('Genuine guest user match data is retained when continuing guest session', async ({ page }) => {
  243 |     await page.goto('http://localhost:8080');
  244 | 
  245 |     // Continue as Guest
  246 |     const guestBtn = page.locator('button:has-text("Continue as Guest")');
  247 |     if (await guestBtn.isVisible()) {
  248 |       await guestBtn.click();
  249 |     }
  250 | 
  251 |     // Create a local Guest match
  252 |     await page.click('button:visible:has-text("Quick Match")');
  253 | 
  254 |     await page.evaluate(async () => {
  255 |       const win = window as any;
  256 |       const elA = document.getElementById('teamAName') as HTMLInputElement | null;
  257 |       const elB = document.getElementById('teamBName') as HTMLInputElement | null;
  258 |       if (elA) elA.value = 'Pure Guest A';
  259 |       if (elB) elB.value = 'Pure Guest B';
  260 | 
  261 |       if (typeof win.addPlayerObjectToSquad === 'function') {
  262 |         win.addPlayerObjectToSquad('A', { id: 'p_pg1', name: 'PureGuestStriker' });
  263 |         win.addPlayerObjectToSquad('A', { id: 'p_pg2', name: 'PureGuestNonStriker' });
  264 |         win.addPlayerObjectToSquad('B', { id: 'p_pg3', name: 'PureGuestBowler' });
  265 |       }
  266 | 
  267 |       if (typeof win.renderSquadList === 'function') {
  268 |         win.renderSquadList('A');
  269 |         win.renderSquadList('B');
  270 |       }
  271 | 
  272 |       if (typeof win.handleCreateMatch === 'function') {
  273 |         await win.handleCreateMatch();
  274 |       }
  275 |     });
  276 | 
  277 |     const tossModal = page.locator('#tossModal');
  278 |     await expect(tossModal).toBeVisible();
```