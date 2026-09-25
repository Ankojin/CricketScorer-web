import { test, expect } from '@playwright/test';

test.describe('CricScore Pro Spectator Read-Only & Live Sync E2E Tests', () => {

  test('Spectator view is read-only, hides keypad, receives live score polling updates, and never mutates state', async ({ browser }) => {
    // ------------------- 1. SCORER SESSION -------------------
    const scorerContext = await browser.newContext();
    const scorerPage = await scorerContext.newPage();

    // Navigate to local web app
    await scorerPage.goto('http://localhost:8080');

    // Continue as Guest if on Landing Screen
    const guestBtn = scorerPage.locator('button:has-text("Continue as Guest")');
    if (await guestBtn.isVisible()) {
      await guestBtn.click();
    }

    // Click Create Match
    await scorerPage.click('button:has-text("+ Create Match")');

    // Populate Team Names and Squads via page controller
    await scorerPage.evaluate(async () => {
      const win = window as any;
      const elA = document.getElementById('teamAName') as HTMLInputElement | null;
      const elB = document.getElementById('teamBName') as HTMLInputElement | null;
      if (elA) elA.value = 'Spectator Rockets';
      if (elB) elB.value = 'Spectator Thunder';

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

    // Wait for Toss Modal to be visible
    const tossModal = scorerPage.locator('#tossModal');
    await expect(tossModal).toBeVisible();

    // Confirm Toss & Start Match Live
    await scorerPage.click('#tossModal button:has-text("Start Match Live")');

    // Handle Striker / Non-Striker / Bowler Selection if prompted
    for (let i = 0; i < 3; i++) {
      const selectionModal = scorerPage.locator('#selectionModal');
      if (await selectionModal.isVisible()) {
        const confirmBtn = scorerPage.locator('#btnConfirmGenericSelection');
        if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
          await confirmBtn.click();
        } else {
          // Select Bowler option directly
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

    // Score Ball 2: 6 runs
    await scorerPage.click('#scoringKeypad button:has-text("6")');
    await expect(scorerPage.locator('#scoreMain')).toHaveText('10/0');

    // Read active match ID and match history from scorer's localStorage
    const matchId = await scorerPage.evaluate(() => {
      return localStorage.getItem('cric_active_match_id');
    });
    const matchesJson = await scorerPage.evaluate(() => {
      return localStorage.getItem('cric_matches');
    });

    expect(matchId).toBeTruthy();
    expect(matchesJson).toBeTruthy();

    // ------------------- 2. SPECTATOR SESSION -------------------
    // Open a completely separate, fresh browser context (simulating another user/device without login)
    const spectatorContext = await browser.newContext();

    // Seed local storage with shared match record so local spectator viewer can resolve the match
    if (matchesJson) {
      await spectatorContext.addInitScript(data => {
        localStorage.setItem('cric_matches', data);
      }, matchesJson);
    }

    const spectatorPage = await spectatorContext.newPage();

    // Track network requests to ensure no mutating HTTP requests are sent by spectator
    const mutatingRequests: string[] = [];
    spectatorPage.on('request', request => {
      const method = request.method();
      if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        mutatingRequests.push(`${method} ${request.url()}`);
      }
    });

    // Navigate to spectator URL with ?matchId=<matchId>
    await spectatorPage.goto(`http://localhost:8080/?matchId=${matchId}`);

    // Assert Spectator Banner is VISIBLE
    const spectatorBanner = spectatorPage.locator('#spectatorBanner');
    await expect(spectatorBanner).toBeVisible();
    await expect(spectatorBanner).toContainText('Spectator Live Viewer Mode');

    // Assert Scoring Keypad is HIDDEN
    const scoringKeypad = spectatorPage.locator('#scoringKeypad');
    await expect(scoringKeypad).toBeHidden();

    // Assert Spectator sees initial live score 10/0
    await expect(spectatorPage.locator('#scoreMain')).toHaveText('10/0');

    // ------------------- 3. LIVE POLLING SCORE SYNC -------------------
    // In Scorer Session: score Ball 3: 4 runs (Total becomes 14/0)
    await scorerPage.click('#scoringKeypad button:has-text("4")');
    await expect(scorerPage.locator('#scoreMain')).toHaveText('14/0');

    // Sync updated match JSON to spectator's storage to simulate background sync
    const updatedMatchesJson = await scorerPage.evaluate(() => {
      return localStorage.getItem('cric_matches');
    });
    if (updatedMatchesJson) {
      await spectatorPage.evaluate(data => {
        localStorage.setItem('cric_matches', data);
      }, updatedMatchesJson);
    }

    // Wait for the 5-second spectator polling interval (+ small margin)
    await spectatorPage.waitForTimeout(6500);

    // Assert Spectator score automatically updates to 14/0 WITHOUT page reload
    await expect(spectatorPage.locator('#scoreMain')).toHaveText('14/0');

    // ------------------- 4. BEHAVIORAL SECURITY GUARANTEE -------------------
    // Assert spectator session issued ZERO mutating requests
    expect(mutatingRequests).toEqual([]);

    await scorerContext.close();
    await spectatorContext.close();
  });

});
