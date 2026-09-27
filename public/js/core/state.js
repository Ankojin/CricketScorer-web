// Shared mutable application state.
let activeMatch = null;

let activeTournament = null;

let activeTourneySubTab = 'TEAMS';

let activeScorecardTab = 'INNINGS1';

let activeOversInningsTab = 'INNINGS1';

let overEndDismissTimer = null;

let tournamentModalMode = 'CREATE';

let editingTournamentId = null;

let currentSelectionType = null;

let selectedTossWinnerId = null;

let selectedTossDecision = 'BAT';

let authTab = 'LOGIN';

let isReadOnlySpectator = false;

let spectatorPollInterval = null;

let seriesTeamSelectedPlayers = [];

let seriesTeamGlobalPlayerCache = [];

let matchSquadA = [];

let matchSquadB = [];

let matchGlobalPlayerCache = [];

let activeMatchFilter = 'ALL';

let activeQuickMatchStep = 0;

let playersDirectoryTab = 'TEAMS';

let currentScoringMode = 'QUICK';

let pendingExtraType = null;

let pendingDropFielderId = null;

let pendingRunOutContext = null;

let pendingEditBallIndex = -1;

let pendingFielderWicketType = null;

let currentWizardStep = 0;

let tossCallerTeam = 'A';

let tossCallChoice = 'HEADS';

let tossDecisionChoice = 'BAT';
