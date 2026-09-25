import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('1. Navigating to https://dzi2g91hixjsk.cloudfront.net/...');
  await page.goto('https://dzi2g91hixjsk.cloudfront.net/', { waitUntil: 'networkidle' });

  // Click Continue as Guest
  const guestBtn = page.locator('button:has-text("Continue as Guest")');
  if (await guestBtn.isVisible()) {
    await guestBtn.click();
    console.log('Clicked Continue as Guest');
  }

  // Click + Create Match
  await page.click('button:has-text("+ Create Match")');

  // Fill Teams and Squads
  await page.evaluate(() => {
    document.getElementById('teamAName').value = 'Live Explore Rockets';
    document.getElementById('teamBName').value = 'Live Explore Thunder';

    window.addPlayerObjectToSquad('A', { id: 'p_a1', name: 'Alice' });
    window.addPlayerObjectToSquad('A', { id: 'p_a2', name: 'Amy' });
    window.addPlayerObjectToSquad('B', { id: 'p_b1', name: 'Bob' });

    window.renderSquadList('A');
    window.renderSquadList('B');
  });

  // Proceed to Toss
  await page.click('button:has-text("Proceed to Toss 🪙")');
  await page.waitForTimeout(500);

  // Click Start Match Live
  await page.click('#tossModal button:has-text("Start Match Live")');
  await page.waitForTimeout(500);

  // Confirm Selection modals if any
  for (let i = 0; i < 3; i++) {
    const selectionModal = page.locator('#selectionModal');
    if (await selectionModal.isVisible()) {
      const confirmBtn = page.locator('#btnConfirmGenericSelection');
      if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
        await confirmBtn.click();
      } else {
        const bowlerOpt = page.locator('#bowlerListContainer .bowler-option').first();
        if (await bowlerOpt.isVisible()) await bowlerOpt.click();
      }
      await page.waitForTimeout(300);
    }
  }

  // Score Ball 1: 4
  await page.click('#scoringKeypad button:has-text("4")');
  await page.waitForTimeout(500);

  // Score Ball 2: 6
  await page.click('#scoringKeypad button:has-text("6")');
  await page.waitForTimeout(500);

  // Take Live Score Screenshot
  await page.screenshot({ path: 'live_site_scoring.png' });
  console.log('Saved live_site_scoring.png (Score 10/0)');

  // Click Scorecard tab
  await page.click('#bottomNav div:has-text("Scorecard")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'live_site_scorecard.png' });
  console.log('Saved live_site_scorecard.png');

  await browser.close();
  console.log('Exploration of live deployed site complete!');
})();
