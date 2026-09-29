// CricLeague application bootstrap. Feature modules load before this file.
window.selectBowlerDirect = selectBowlerDirect;

window.addEventListener('DOMContentLoaded', async () => {
  initializeDialogAccessibility();
  updateAuthUI();
  updateScorecardTabUI();
  updateDeviceSyncStatus();
  window.addEventListener('online', updateDeviceSyncStatus);
  window.addEventListener('offline', updateDeviceSyncStatus);
  window.addEventListener('popstate', () => {
    if (!handleUrlRouting()) {
      showScreen('screenLanding');
      renderHomeDashboard();
    }
  });

  // Check URL routing for separate navigation pages (/web-score, /quick-match, /series, /coin-toss, /settings-gully-rules)
  const isRouted = handleUrlRouting();

  // Check URL query parameters for Spectator Live View Mode (?matchId=match_123)
  const urlParams = new URLSearchParams(window.location.search);
  const sharedMatchId = urlParams.get('matchId');

  if (sharedMatchId) {
    isReadOnlySpectator = true;
    selectMatch(sharedMatchId);

    // Auto-poll live score every 5 seconds for spectators
    spectatorPollInterval = setInterval(async () => {
      if (activeMatch && isReadOnlySpectator) {
        const fresh = await window.CricStorage.getMatch(activeMatch.id);
        if (fresh) {
          activeMatch = window.ScoringEngine.recalculateMatch(fresh);
          if (activeMatch.status !== 'LIVE') {
            showToast('Live link expired: match has ended.', 'info');
            activeMatch = null;
            clearInterval(spectatorPollInterval);
            spectatorPollInterval = null;
            showLandingScreen();
            return;
          }
          renderLiveScoring();
        }
      }
    }, 5000);

    return;
  }

  // Default to Landing / Home screen if no specific page route was requested
  if (!isRouted) {
    showLandingScreen();
  }

  if (!sharedMatchId) {
    const savedMatchId = localStorage.getItem('cric_active_match_id');
    if (savedMatchId) {
      try {
        const savedMatch = await window.CricStorage.getMatch(savedMatchId);
        if (savedMatch?.scoringMode === 'WEBSCORE' && savedMatch.status === 'LIVE') {
          currentScoringMode = 'WEBSCORE';
          await selectMatch(savedMatch.id);
          return;
        }
      } catch (err) {
        console.warn('Could not restore active WebScore match:', err);
      }
    }
  }
});

document.addEventListener('click', (e) => {
  const menu = document.getElementById('featuresMenuDropdown');
  const trigger = e.target.closest('.features-trigger-btn') || e.target.closest('.cric-btn-outline');
  if (menu && !menu.hidden && !menu.contains(e.target) && !trigger) {
    menu.hidden = true;
  }
});

window.toggleFeaturesMenu = toggleFeaturesMenu;

window.closeFeaturesMenu = closeFeaturesMenu;

window.showWebScoreLandingScreen = showWebScoreLandingScreen;

window.showQuickMatchLandingScreen = showQuickMatchLandingScreen;
window.showFullMatchLandingScreen = showQuickMatchLandingScreen;

window.showSeriesLandingScreen = showSeriesLandingScreen;

window.startSeriesMatch = startSeriesMatch;

window.navigateToRoute = navigateToRoute;

window.handleUrlRouting = handleUrlRouting;

window.startWebScore = startWebScore;

window.startQuickMatch = startQuickMatch;
window.startFullMatch = startQuickMatch;

window.viewAllMatches = viewAllMatches;

window.goToWizardTeamsStep = goToWizardTeamsStep;

window.goToWizardOversStep = goToWizardOversStep;

window.adjustMatchOvers = adjustMatchOvers;

window.setQuickMatchOvers = setQuickMatchOvers;

window.syncTeamNamesToTossUI = syncTeamNamesToTossUI;

window.goToWizardTossStep = goToWizardTossStep;

window.selectTossCaller = selectTossCaller;

window.flipCoinChoice = flipCoinChoice;

window.setTossDecisionChoice = setTossDecisionChoice;

window.finishWizardAndStartMatch = finishWizardAndStartMatch;

window.openQuickTossModal = openQuickTossModal;

window.closeStandaloneCoinTossModal = closeStandaloneCoinTossModal;

window.spinStandaloneCoin = spinStandaloneCoin;

window.resetStandaloneCoin = resetStandaloneCoin;

window.promptSpectatorStream = promptSpectatorStream;

window.addPlayerObjectToSquad = addPlayerObjectToSquad;

window.renderSquadList = renderSquadList;

window.onAddNewPlayerInput = onAddNewPlayerInput;

window.removeFromSquad = removeFromSquad;

window.handleCreateMatch = handleCreateMatch;

window.confirmTossAndStart = confirmTossAndStart;

window.startSecondInnings = startSecondInnings;

window.showLiveScreen = showLiveScreen;
