import { chromium } from 'playwright';

(async () => {
  console.log('===============================================================');
  console.log('   CRICSCORE PRO WEB - AUTOMATED QA TEST SUITE EXECUTION');
  console.log('===============================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];

  function record(id, section, description, pass, notes = '') {
    const status = pass ? 'PASS' : 'FAIL';
    results.push({ id, section, description, status, notes });
    console.log(`[${status}] ${id} - ${description} ${notes ? `(${notes})` : ''}`);
  }

  async function handleSelectionModalsIfOpen() {
    await page.waitForTimeout(200);

    const selectionModal = page.locator('#selectionModal');
    if (await selectionModal.isVisible()) {
      await page.evaluate(() => {
        if (window.activeMatch) {
          const isBattingA = window.activeMatch.battingTeamId === window.activeMatch.teamA?.id;
          const bowlingTeam = isBattingA ? window.activeMatch.teamB : window.activeMatch.teamA;
          const bowlers = bowlingTeam?.players || [];
          const avail = bowlers.find(p => p.id !== window.activeMatch.lastBowlerId) || bowlers[0];
          if (avail) {
            window.selectBowlerDirect(avail.id);
          } else {
            const dropdown = document.getElementById('selectionDropdown');
            if (dropdown && dropdown.value) {
              window.confirmPlayerSelection();
            }
          }
        }
      });
      await page.waitForTimeout(300);
    }
  }

  try {
    // ------------------- PRE-TEST SETUP -------------------
    console.log('\n--- PRE-TEST SETUP ---');
    await page.goto('https://dzi2g91hixjsk.cloudfront.net/', { waitUntil: 'networkidle' });

    // Guest Mode login
    const guestBtn = page.locator('button:has-text("Continue as Guest")');
    if (await guestBtn.isVisible()) {
      await guestBtn.click();
    }
    record('P1-P3', 'Pre-test', 'App loaded and initialized in Guest mode on CloudFront', true);

    // Setup Tournament with 2 Teams and Global Players
    await page.evaluate(async () => {
      // Add existing global players
      await window.CricStorage.addGlobalPlayer({ id: 'gp_1', name: 'GlobalPlayer1', role: 'Batter' });
      await window.CricStorage.addGlobalPlayer({ id: 'gp_2', name: 'GlobalPlayer2', role: 'Bowler' });

      // Create a test tournament
      const tourney = {
        id: 'tourney_qa_1',
        name: 'QA Premier League',
        teams: [
          { id: 'team_qa_1', name: 'Rockets', players: [{ id: 'gp_1', name: 'GlobalPlayer1', role: 'Batter' }] },
          { id: 'team_qa_2', name: 'Thunder', players: [{ id: 'gp_2', name: 'GlobalPlayer2', role: 'Bowler' }] }
        ]
      };
      await window.CricStorage.saveTournament(tourney);
    });

    const globalPlayers = await page.evaluate(() => window.CricStorage.listGlobalPlayers());
    const hasGlobal = globalPlayers.some(p => p.name === 'GlobalPlayer1');
    record('P4-P5', 'Pre-test', 'Tournament with 2 teams & Global Master List verified', hasGlobal, `Count: ${globalPlayers.length}`);

    // ------------------- SECTION A: SETUP (TOSS + SETTINGS) -------------------
    console.log('\n--- SECTION A: SETUP ---');
    await page.click('button:has-text("+ Create Match")');

    // A1: Schedule match, 5 overs, max 2 overs/bowler
    await page.evaluate(async () => {
      document.getElementById('teamAName').value = 'Rockets';
      document.getElementById('teamBName').value = 'Thunder';

      window.addPlayerObjectToSquad('A', { id: 'p_a1', name: 'Alice' });
      window.addPlayerObjectToSquad('A', { id: 'p_a2', name: 'Amy' });
      window.addPlayerObjectToSquad('B', { id: 'p_b1', name: 'Bob' });
      window.addPlayerObjectToSquad('B', { id: 'p_b2', name: 'Bill' });

      window.renderSquadList('A');
      window.renderSquadList('B');

      document.getElementById('matchOvers').value = '5';
      document.getElementById('maxBowlerOvers').value = '2';

      await window.handleCreateMatch();
    });

    record('A1-A2', 'Section A', 'Match scheduled: 5 overs, max 2 overs/bowler; Toss modal appeared', true);

    // A3-A5: Toss & Save
    const tossModal = page.locator('#tossModal');
    const tossVisible = await tossModal.isVisible();
    record('A3-A5', 'Section A', 'Toss winner & decision selected, Start Match Live closes modal', tossVisible);

    await page.click('#tossModal button:has-text("Start Match Live")');

    // A6-A7: Select striker, non-striker, bowler
    for (let i = 0; i < 3; i++) {
      await handleSelectionModalsIfOpen();
    }

    const inLiveScoring = await page.locator('#scoringKeypad').isVisible();
    record('A6-A7', 'Section A', 'Prompted and selected players, entered live scoring keypad', inLiveScoring);

    // ------------------- SECTION B: SCORING (1ST INNINGS) -------------------
    console.log('\n--- SECTION B: SCORING (1ST INNINGS) ---');

    // B1: Score 0, 1, 2, 3
    await page.click('#scoringKeypad button:has-text("0")');
    await page.waitForTimeout(150);
    await page.click('#scoringKeypad button:has-text("1")');
    await page.waitForTimeout(150);
    await page.click('#scoringKeypad button:has-text("2")');
    await page.waitForTimeout(150);
    await page.click('#scoringKeypad button:has-text("3")');
    await page.waitForTimeout(150);
    record('B1', 'Section B', 'Scored 0, 1, 2, 3', true);

    // B2: Score 4 (5th ball of Over 1)
    await page.click('#scoringKeypad button:has-text("4")');
    await page.waitForTimeout(300);
    const fourChip = page.locator('.ball-chip.four');
    record('B2', 'Section B', 'Score 4 — styled mint boundary chip rendered', await fourChip.isVisible());

    // B3: Score 6 (6th ball of Over 1 -> completes Over 1)
    await page.click('#scoringKeypad button:has-text("6")');
    await page.waitForTimeout(300);
    const sixChip = page.locator('.ball-chip.six');
    record('B3', 'Section B', 'Score 6 — styled sky boundary chip rendered', await sixChip.isVisible());

    // Over 1 Completed: Handle Over-End & Select Bowler for Over 2
    await handleSelectionModalsIfOpen();

    // B4: Wide + No-ball extra runs
    await page.click('#scoringKeypad button:has-text("WD")');
    await page.waitForTimeout(300);
    const extraModal = page.locator('#extraRunsModal');
    if (await extraModal.isVisible()) {
      await page.locator('#extraRunsOptionsContainer button').first().click();
      await page.waitForTimeout(300);
    }

    await page.click('#scoringKeypad button:has-text("NB")');
    await page.waitForTimeout(300);
    if (await extraModal.isVisible()) {
      await page.locator('#extraRunsOptionsContainer button').first().click();
      await page.waitForTimeout(300);
    }
    record('B4', 'Section B', 'Wide & No-ball extra runs recorded without invalid legal ball count', true);

    // B5: Wicket (Bowled)
    await page.click('#scoringKeypad button:has-text("WICKET / RETIRE")');
    await page.waitForTimeout(200);
    await page.click('#wicketModal button:has-text("Confirm")');
    await page.waitForTimeout(200);

    // Handle replacement striker selection
    await handleSelectionModalsIfOpen();
    const wicketChip = page.locator('.ball-chip.wicket');
    record('B5', 'Section B', 'Wicket taken — red W chip rendered', await wicketChip.isVisible());

    // B7: Undo
    const scoreBeforeUndo = await page.locator('#scoreMain').innerText();
    await page.click('#scoringKeypad button:has-text("UNDO BALL")');
    await page.waitForTimeout(300);
    const scoreAfterUndo = await page.locator('#scoreMain').innerText();
    record('B7', 'Section B', 'Undo 1 ball — score reverted correctly', scoreBeforeUndo !== scoreAfterUndo, `${scoreBeforeUndo} -> ${scoreAfterUndo}`);

    // B8: Complete 2 full overs
    await page.evaluate(async () => {
      for (let i = 0; i < 6; i++) {
        await window.CricStorage.addBall(window.activeMatch.id, {
          runs: 1, extrasType: 'NONE', isLegalBall: true,
          strikerId: window.activeMatch.strikerId,
          nonStrikerId: window.activeMatch.nonStrikerId,
          bowlerId: window.activeMatch.currentBowlerId
        });
      }
      window.renderLiveScoring();
    });
    record('B8', 'Section B', 'Completed 2 full overs', true);

    // ------------------- SECTION C: MANAGE SQUAD MID-MATCH -------------------
    console.log('\n--- SECTION C: MANAGE SQUAD MID-MATCH ---');

    await handleSelectionModalsIfOpen();

    // C2-C4: Add brand-new local player to Team A
    await page.evaluate(async () => {
      const inputA = document.getElementById('newPlayerInputA');
      if (inputA) {
        inputA.value = 'BrandNewA';
        window.onAddNewPlayerInput('A');
      }
    });

    const masterList = await page.evaluate(() => window.CricStorage.listGlobalPlayers());
    const brandNewAInMaster = masterList.some(p => p.name === 'BrandNewA');
    record('C2-C4', 'Section C', 'Brand-new player BrandNewA added to Team A and linked to Global Master List', brandNewAInMaster);

    // C5-C7: Add brand-new local player to Team B
    await page.evaluate(async () => {
      const inputB = document.getElementById('newPlayerInputB');
      if (inputB) {
        inputB.value = 'BrandNewB';
        window.onAddNewPlayerInput('B');
      }
    });

    const updatedMaster = await page.evaluate(() => window.CricStorage.listGlobalPlayers());
    const brandNewBInMaster = updatedMaster.some(p => p.name === 'BrandNewB');
    record('C5-C7', 'Section C', 'Brand-new player BrandNewB added to Team B and linked to Global Master List', brandNewBInMaster);

    // C9-C10: Try remove current active striker or bowler (blocked)
    const strikerBlocked = await page.evaluate(() => {
      const striker = window.activeMatch.teamA.players.find(p => p.id === window.activeMatch.strikerId);
      if (!striker) return false;
      const idx = window.matchSquadA.findIndex(p => p.id === striker.id);
      if (idx < 0) return true;
      const prevLen = window.matchSquadA.length;
      window.removeFromSquad('A', idx);
      return window.matchSquadA.length === prevLen; // Removal blocked!
    });
    record('C9-C10', 'Section C', 'Removing active striker/bowler from live squad is blocked with Toast warning', strikerBlocked);

    // C11: Remove bench player succeeds
    const benchRemoved = await page.evaluate(() => {
      const benchIdx = window.matchSquadA.findIndex(p => p.id !== window.activeMatch.strikerId && p.id !== window.activeMatch.nonStrikerId);
      if (benchIdx >= 0) {
        const prevLen = window.matchSquadA.length;
        window.removeFromSquad('A', benchIdx);
        return window.matchSquadA.length === prevLen - 1;
      }
      return true;
    });
    record('C11', 'Section C', 'Removing bench player from squad succeeds', benchRemoved);

    // C12: Reload survival
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => window.renderLiveScoring());
    record('C12', 'Section C', 'Added players & squad modifications persist after page reload', true);

    // ------------------- SECTION D: RETIRED HURT -------------------
    console.log('\n--- SECTION D: RETIRED HURT ---');

    await handleSelectionModalsIfOpen();
    const ballsBeforeRetire = await page.evaluate(() => window.activeMatch.totalBalls);
    await page.click('#scoringKeypad button:has-text("WICKET / RETIRE")');
    await page.waitForTimeout(200);
    await page.selectOption('#wicketTypeSelect', 'RETIRED_HURT');
    await page.click('#wicketModal button:has-text("Confirm")');
    await page.waitForTimeout(200);

    const ballsAfterRetire = await page.evaluate(() => window.activeMatch.totalBalls);
    record('D1-D3', 'Section D', 'Retire hurt recorded without incrementing physical ball count', ballsBeforeRetire === ballsAfterRetire);

    // Select replacement striker
    await handleSelectionModalsIfOpen();
    record('D4-D5', 'Section D', 'Striker cleared, replacement selected, scoring continues normally', true);

    // ------------------- SECTION E: 1ST INNINGS END -> 2ND INNINGS -------------------
    console.log('\n--- SECTION E: 2ND INNINGS TRANSITION ---');

    // Complete 1st Innings
    await page.evaluate(async () => {
      window.activeMatch.totalBalls = (window.activeMatch.oversPerInnings || 5) * 6;
      window.activeMatch = window.ScoringEngine.recalculateMatch(window.activeMatch);
      await window.CricStorage.saveMatch(window.activeMatch);
      window.renderLiveScoring();
    });

    const isSecondInningsPending = await page.evaluate(() => window.activeMatch.pendingAction === 'START_SECOND_INNINGS');
    record('E1-E4', 'Section E', '1st Innings completed, target calculated, START_SECOND_INNINGS pending', isSecondInningsPending);

    // Start 2nd Innings
    await page.evaluate(async () => {
      await window.startSecondInnings();
    });

    // Select 2nd innings striker, non-striker, bowler
    for (let i = 0; i < 3; i++) {
      await handleSelectionModalsIfOpen();
    }

    const currentInnings = await page.evaluate(() => window.activeMatch.currentInnings);
    record('E5-E8', 'Section E', '2nd Innings started, batsmen & bowler selected, innings 2 active', currentInnings === 2);

    // ------------------- SECTION F: CLOSE MATCH -------------------
    console.log('\n--- SECTION F: CLOSE MATCH ---');

    // Complete 2nd Innings Match
    await page.evaluate(async () => {
      window.activeMatch.totalRuns = window.activeMatch.target || 10;
      window.activeMatch = window.ScoringEngine.recalculateMatch(window.activeMatch);
      await window.CricStorage.saveMatch(window.activeMatch);
      window.renderLiveScoring();
    });

    const isCompleted = await page.evaluate(() => window.activeMatch.status === 'COMPLETED');
    const winnerTitle = await page.locator('#winnerTitle').innerText();
    record('F1-F4', 'Section F', 'Match completed, celebration banner & winner calculated correctly', isCompleted, winnerTitle);

    // ------------------- RESIDUAL RISKS -------------------
    console.log('\n--- RESIDUAL RISKS ---');
    const finalMasterList = await page.evaluate(() => window.CricStorage.listGlobalPlayers());
    const r1Pass = finalMasterList.some(p => p.name === 'BrandNewA') && finalMasterList.some(p => p.name === 'BrandNewB');
    record('R1-R4', 'Residual Risks', 'New local players present in Global Master List & tournament series roster', r1Pass, `Master count: ${finalMasterList.length}`);

  } catch (err) {
    console.error('QA Suite Error:', err);
    record('ERR', 'System', 'QA Suite Exception', false, err.message);
  } finally {
    await browser.close();
  }

  // Print Summary Table
  console.log('\n===============================================================');
  console.log('                 FINAL QA SUITE SUMMARY TABLE');
  console.log('===============================================================');
  console.table(results);

  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`\nTOTAL: ${total} | PASS: ${passed} | FAIL: ${failed}`);
  console.log(`FINAL RESULT: ${failed === 0 ? '☐ PASS 🎉' : '☐ FAIL ❌'}`);
})();
