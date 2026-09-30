// CricLeague application bootstrap. Feature modules load before this file.
window.selectBowlerDirect = selectBowlerDirect;

function applySpectatorUiRestrictions() {
  const headerActions = document.querySelector('.app-header-actions');
  if (headerActions) headerActions.style.display = 'none';

  const appTitle = document.querySelector('.app-title');
  if (appTitle) {
    appTitle.removeAttribute('onclick');
    appTitle.style.cursor = 'default';
  }

  document.querySelectorAll('[data-nav-context="general"]').forEach(el => {
    el.style.display = 'none';
  });
}

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
  const spectatorToken = urlParams.get('st');
  const forceSpectator = urlParams.get('spectator') === '1';
  const canOpenScorerMode = isRegisteredScoringUser();

  if (sharedMatchId) {
    if (!spectatorToken && !canOpenScorerMode) {
      showToast('Invalid or expired spectator link', 'warning');
      showLandingScreen();
      return;
    }

    if (spectatorToken && (forceSpectator || !canOpenScorerMode)) {
      isReadOnlySpectator = true;
      applySpectatorUiRestrictions();
      selectMatch(sharedMatchId);

      // Auto-poll live score every 5 seconds for spectators
      spectatorPollInterval = setInterval(async () => {
        if (activeMatch && isReadOnlySpectator) {
          try {
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
          } catch (err) {
            showToast('Unable to refresh live score. Link may be expired.', 'warning');
            activeMatch = null;
            clearInterval(spectatorPollInterval);
            spectatorPollInterval = null;
            showLandingScreen();
          }
        }
      }, 5000);

      return;
    }

    isReadOnlySpectator = false;
    if (spectatorPollInterval) {
      clearInterval(spectatorPollInterval);
      spectatorPollInterval = null;
    }
    if (spectatorToken && canOpenScorerMode) {
      showToast('Opened in scorer mode. Add spectator=1 in URL for read-only view.', 'info');
    }
    await selectMatch(sharedMatchId);
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

window.showAboutScreen = showAboutScreen;

window.showInfoScreen = showInfoScreen;

window.openPrivacyPolicy = openPrivacyPolicy;

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
