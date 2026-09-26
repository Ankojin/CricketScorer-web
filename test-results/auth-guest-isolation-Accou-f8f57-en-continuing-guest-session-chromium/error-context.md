# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-guest-isolation.spec.ts >> Account Logout & Guest Mode Data Isolation E2E Tests >> Genuine guest user match data is retained when continuing guest session
- Location: test\e2e\auth-guest-isolation.spec.ts:242:3

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: page.click: Test timeout of 45000ms exceeded.
Call log:
  - waiting for locator('button.cric-btn:has-text("Quick Match")')
    - locator resolved to 3 elements. Proceeding with the first one: <button type="button" onclick="startQuickMatch()" class="cric-btn cric-btn-primary">↵                🏏 Quick Match →↵              </button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
      - waiting 100ms
    84 × waiting for element to be visible, enabled and stable
       - element is not visible
     - retrying click action
       - waiting 500ms

```

# Test source

```ts
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
  178 |     await expect(tossModal).toBeVisible();
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
> 252 |     await page.click('button.cric-btn:has-text("Quick Match")');
      |                ^ Error: page.click: Test timeout of 45000ms exceeded.
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
  279 | 
  280 |     await page.click('#tossModal button:has-text("Start match")');
  281 | 
  282 |     // Confirm initial selection prompts
  283 |     for (let i = 0; i < 3; i++) {
  284 |       const selectionModal = page.locator('#selectionModal');
  285 |       if (await selectionModal.isVisible()) {
  286 |         const confirmBtn = page.locator('#btnConfirmGenericSelection');
  287 |         if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
  288 |           await confirmBtn.click();
  289 |         } else {
  290 |           const bowlerOpt = page.locator('#bowlerListContainer .bowler-option').first();
  291 |           if (await bowlerOpt.isVisible()) {
  292 |             await bowlerOpt.click();
  293 |           }
  294 |         }
  295 |         await page.waitForTimeout(300);
  296 |       }
  297 |     }
  298 | 
  299 |     // Score 1 ball to ensure match has data
  300 |     await page.click('#scoringKeypad button:has-text("1")');
  301 | 
  302 |     // Navigate back to Landing screen
  303 |     await page.evaluate(() => {
  304 |       const win = window as any;
  305 |       if (typeof win.showLandingScreen === 'function') {
  306 |         win.showLandingScreen();
  307 |       }
  308 |     });
  309 | 
  310 |     // Returning home in Guest mode must keep the saved match visible.
  311 |     await expect(page.locator('#homeDashboard')).toBeVisible();
  312 |     await expect(page.locator('#homeRecentMatches')).toContainText('Pure Guest A vs Pure Guest B');
  313 | 
  314 |     // Assert Guest match data is NOT wiped
  315 |     const guestMatches = await page.evaluate(() => {
  316 |       const raw = localStorage.getItem('cric_matches');
  317 |       return raw ? JSON.parse(raw) : [];
  318 |     });
  319 | 
  320 |     expect(guestMatches.length).toBeGreaterThan(0);
  321 |     expect(guestMatches[0].teamA.name).toBe('Pure Guest A');
  322 |   });
  323 | 
  324 | });
  325 | 
```