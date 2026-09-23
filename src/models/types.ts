export type BattingStyle = 'RHB' | 'LHB';

export type ExtrasType = 'NONE' | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE' | 'GRANTED';

export type WicketType =
  | 'NONE'
  | 'BOWLED'
  | 'CAUGHT'
  | 'LBW'
  | 'RUN_OUT'
  | 'STUMPED'
  | 'HIT_WICKET'
  | 'HANDLED_BALL'
  | 'OBSTRUCTING_FIELD'
  | 'RETIRED_HURT';

export type MatchStatus = 'UPCOMING' | 'LIVE' | 'COMPLETED' | 'ABANDONED';

export type PendingAction =
  | 'NONE'
  | 'SELECT_STRIKER'
  | 'SELECT_NON_STRIKER'
  | 'SELECT_BOWLER'
  | 'TOSS_REQUIRED'
  | 'SELECT_WK_A'
  | 'SELECT_WK_B'
  | 'SELECT_FIELDER'
  | 'START_SECOND_INNINGS'
  | 'SELECT_FIELDER_DROPPED_CATCH'
  | 'SELECT_RUNS_DROPPED_CATCH'
  | 'REPLACE_STRIKER'
  | 'REPLACE_NON_STRIKER'
  | 'REPLACE_BOWLER'
  | 'SELECT_RUNS_WICKET'
  | 'SELECT_MATCH_SETTINGS';

export interface BattingStats {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  isRetiredHurt: boolean;
  wicketType: WicketType;
  dismissalBowlerId?: string | null;
  dismissalFielderId?: string | null;
}

export interface BowlingStats {
  overs: number;
  balls: number;
  maidens: number;
  runsConceded: number;
  wickets: number;
  dotBalls: number;
  wides: number;
  noBalls: number;
}

export interface FieldingStats {
  catches: number;
  runOuts: number;
  stumpings: number;
  droppedCatches: number;
}

export interface Player {
  id: string;
  name: string;
  battingStats: BattingStats;
  bowlingStats: BowlingStats;
  fieldingStats: FieldingStats;
  isJoker?: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  battingStyle?: BattingStyle;
}

export interface Team {
  id: string;
  name: string;
  players: Player[];
  matchesPlayed?: number;
  wins?: number;
  losses?: number;
  points?: number;
  nrr?: number;
  colorHex?: string | null;
}

export interface Ball {
  runs: number;
  extrasType?: ExtrasType;
  extraRuns?: number;
  wicketType?: WicketType;
  strikerId?: string | null;
  nonStrikerId?: string | null;
  bowlerId?: string | null;
  fielderId?: string | null;
  isLegalBall?: boolean;
  outPlayerId?: string | null;
  rotateStrike?: boolean;
  hadCrossed?: boolean;
  isDroppedCatch?: boolean;
  dismissalReason?: string | null;
  isAdjustment?: boolean;
  adjustmentSlot?: string | null;
  adjustmentPlayerId?: string | null;
  isReplacement?: boolean;
}

export function isPhysicalBall(ball: Ball): boolean {
  return !ball.isAdjustment &&
    ball.extrasType !== 'WIDE' &&
    ball.extrasType !== 'NO_BALL' &&
    ball.wicketType !== 'RETIRED_HURT';
}

export interface WicketRecord {
  wicketNumber: number;
  batterName: string;
  totalRuns: number;
  over: string;
  wicketType: WicketType;
  bowlerName?: string | null;
  fielderName?: string | null;
  dismissalReason?: string | null;
}

export interface InningsSummary {
  runs: number;
  wickets: number;
  balls: number;
  teamId: string;
  wicketHistory: WicketRecord[];
  wideCount: number;
  noBallCount: number;
  byeCount: number;
  legByeCount: number;
  recordedBallsCount: number;
  durationMinutes: number;
  battingOrder: string[];
}

export interface GullyRules {
  commonPlayer?: boolean;
  unequalTeams?: boolean;
  playersJoinMidMatch?: boolean;
  playersSwitchMidMatch?: boolean;
  lastManStanding?: boolean;
  singleSideBatting?: boolean;
  noExtraRunsForWidesNoBalls?: boolean;
}

export interface Match {
  id: string;
  tournamentId?: string | null;
  tournamentName?: string | null;
  teamA: Team;
  teamB: Team;
  tossWinnerId?: string | null;
  tossDecision?: string | null; // "BAT" or "BOWL"
  initialBattingTeamId?: string | null;
  initialBowlingTeamId?: string | null;

  teamACaptainId?: string | null;
  teamBCaptainId?: string | null;
  teamAWicketKeeperId?: string | null;
  teamBWicketKeeperId?: string | null;

  target?: number | null;
  status: MatchStatus;
  currentInnings: number;
  battingTeamId: string;
  bowlingTeamId: string;
  totalRuns: number;
  totalWickets: number;
  totalBalls: number;
  wideCount: number;
  noBallCount: number;
  byeCount: number;
  legByeCount: number;
  ballHistory: Ball[];
  wicketHistory: WicketRecord[];
  strikerId?: string | null;
  nonStrikerId?: string | null;
  currentBowlerId?: string | null;
  lastBowlerId?: string | null;
  winnerId?: string | null;
  manOfTheMatchId?: string | null;
  oversPerInnings: number;
  maxOversPerBowler?: number | null;
  quotaBowlersCount?: number | null;
  quotaMaxOvers?: number | null;
  gullyRules: GullyRules;
  pendingAction: PendingAction;
  innings1Data?: InningsSummary | null;
  isSecondInningsStarted?: boolean;
  innings1EndTimeMillis?: number | null;
  innings2StartTimeMillis?: number | null;
  lastNotifiedBowlerId?: string | null;
  battingOrder: string[];
  startTimeMillis?: number | null;
  endTimeMillis?: number | null;
  dateMillis: number;
}

export interface OverSummary {
  overNumber: number;
  runs: number;
  wickets: number;
  ballLabels: string[];
  teamTotalRuns: number;
  teamTotalWickets: number;
  battingTeamName: string;
}
