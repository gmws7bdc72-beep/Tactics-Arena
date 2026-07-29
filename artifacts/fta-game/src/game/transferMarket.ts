import type { LeagueState, PlayerCard, TeamConfig } from "../engine/types";
import { AI_TEAMS } from "./league";
import {
  enrichMarketPlayer,
  getPlayerOverall,
  MAX_SQUAD_SIZE,
} from "./transferDatabase";

export type OfferStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "countered"
  | "completed"
  | "withdrawn";

export interface TransferOffer {
  id: string;
  playerId: string;
  playerName: string;
  /** The club making the bid (the buyer). */
  fromClubId: string;
  fromClubName: string;
  /** The club that owns the player (the seller). */
  toClubId: string;
  toClubName: string;
  amount: number;
  createdSeason?: number;
  createdWeek: number;
  status: OfferStatus;
  counterAmount?: number;
  counteredByClubId?: string;
  lastUpdatedWeek?: number;
}

export interface ClubFinance {
  clubId: string;
  budget: number;
  wageBudget: number;
  payroll: number;
  sales: number;
  purchases: number;
  prizeMoney: number;
}

export interface TransferTransaction {
  id: string;
  playerId: string;
  playerName: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  amount: number;
  season: number;
  week: number;
}

export type TransferNewsKind =
  | "offer"
  | "negotiation"
  | "transfer"
  | "finance"
  | "system";

export interface TransferNewsItem {
  id: string;
  kind: TransferNewsKind;
  headline: string;
  season: number;
  week: number;
  playerId?: string;
  clubIds?: string[];
  amount?: number;
}

export interface PlayerCareerEntry {
  id: string;
  type: "season" | "transfer";
  season: number;
  week: number;
  clubId: string;
  clubName: string;
  overall?: number;
  marketValue?: number;
  fromClubId?: string;
  fromClubName?: string;
  toClubId?: string;
  toClubName?: string;
  fee?: number;
}

export type ClubSeasonOutcome =
  | "Champion"
  | "Runner-up"
  | "Playoff semifinal"
  | "League season";

export interface ClubSeasonHistoryEntry {
  season: number;
  clubId: string;
  clubName: string;
  finalPosition: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  outcome: ClubSeasonOutcome;
  prizeMoney: number;
  transfersIn: number;
  transfersOut: number;
  transferSpent: number;
  transferReceived: number;
  endingBudget: number;
  payroll: number;
  squadValue: number;
}

export interface SeasonStandout {
  playerId: string;
  playerName: string;
  clubId: string;
  clubName: string;
  overall: number;
  seasonGrowth: number;
}

export interface SeasonReport {
  id: string;
  season: number;
  championId: string;
  championName: string;
  playerFinish: number;
  transfersCompleted: number;
  totalTransferValue: number;
  biggestTransfer?: TransferTransaction;
  standout?: SeasonStandout;
  clubs: ClubSeasonHistoryEntry[];
}

export interface TransferMarketState {
  version: 3;
  season: number;
  week: number;
  finances: Record<string, ClubFinance>;
  offers: TransferOffer[];
  transactions: TransferTransaction[];
  /** Kept for compatibility with Phase 5 saves and older UI. */
  news: string[];
  newsFeed: TransferNewsItem[];
  clubHistory: Record<string, ClubSeasonHistoryEntry[]>;
  playerCareers: Record<string, PlayerCareerEntry[]>;
  seasonReports: SeasonReport[];
}

export interface TransferActionResult {
  state: TransferMarketState;
  team: TeamConfig;
  league: LeagueState;
}

interface MarketClub {
  id: string;
  name: string;
  players: PlayerCard[];
}

const KEY = "fta_transfer_market_v1";
const PLAYER_ID = "player_team";
const MIN_MATCH_SQUAD_SIZE = 6;
const ACTIVE_OFFER_STATUSES: OfferStatus[] = ["pending", "countered"];
const MAX_NEWS_ITEMS = 80;
const MAX_TRANSACTIONS = 100;
const MAX_CAREER_ITEMS = 40;
const MAX_CLUB_HISTORY_ITEMS = 20;

let newsSequence = 0;

const prizeByPlace = [50, 40, 35, 30, 25, 25, 20, 20, 15, 15].map(
  (value) => value * 1_000_000,
);
const baseBudgets = [55, 48, 42, 38, 34, 30, 27, 24, 21, 18].map(
  (value) => value * 1_000_000,
);

function payroll(players: PlayerCard[]): number {
  return players.reduce((sum, player) => sum + (player.weeklyWage ?? 0), 0);
}

interface NewsDetails {
  kind?: TransferNewsKind;
  playerId?: string;
  clubIds?: string[];
  amount?: number;
}

function inferNewsKind(message: string): TransferNewsKind {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("prize money") ||
    normalized.includes("budget") ||
    normalized.includes("wage")
  ) {
    return "finance";
  }

  if (
    normalized.includes("counter") ||
    normalized.includes("negotiat") ||
    normalized.includes("walked away")
  ) {
    return "negotiation";
  }

  if (
    normalized.includes("transferred") ||
    normalized.includes("registered") ||
    normalized.includes("completed")
  ) {
    return "transfer";
  }

  if (
    normalized.includes("bid") ||
    normalized.includes("offer") ||
    normalized.includes("rejected") ||
    normalized.includes("withdrawn")
  ) {
    return "offer";
  }

  return "system";
}

function addNews(
  state: TransferMarketState,
  message: string,
  details: NewsDetails = {},
): TransferMarketState {
  const item: TransferNewsItem = {
    id: `news_${state.season}_${state.week}_${Date.now()}_${newsSequence++}`,
    kind: details.kind ?? inferNewsKind(message),
    headline: message,
    season: state.season,
    week: state.week,
    playerId: details.playerId,
    clubIds: details.clubIds,
    amount: details.amount,
  };

  return {
    ...state,
    news: [message, ...state.news].slice(0, MAX_NEWS_ITEMS),
    newsFeed: [item, ...(state.newsFeed ?? [])].slice(0, MAX_NEWS_ITEMS),
  };
}

function isActiveOffer(offer: TransferOffer): boolean {
  return ACTIVE_OFFER_STATUSES.includes(offer.status);
}

function aiBaseSquad(clubId: string): PlayerCard[] {
  return AI_TEAMS.find((club) => club.id === clubId)?.players ?? [];
}

function allClubPlayers(team: TeamConfig, league: LeagueState): MarketClub[] {
  return [
    { id: PLAYER_ID, name: team.name, players: team.players },
    ...AI_TEAMS.map((club) => ({
      id: club.id,
      name: club.name,
      players: league.aiSquads?.[club.id] ?? club.players,
    })),
  ];
}

function clubName(team: TeamConfig, clubId: string): string {
  if (clubId === PLAYER_ID) return team.name;
  return AI_TEAMS.find((club) => club.id === clubId)?.name ?? clubId;
}

function validOfferStatus(value: unknown): value is OfferStatus {
  return [
    "pending",
    "accepted",
    "rejected",
    "countered",
    "completed",
    "withdrawn",
  ].includes(String(value));
}

function keepGoalkeeperFirst(players: PlayerCard[]): PlayerCard[] {
  const goalkeeperIndex = players.findIndex(
    (player) => player.role === "goalkeeper",
  );

  if (goalkeeperIndex <= 0) return players;

  const ordered = [...players];
  const [goalkeeper] = ordered.splice(goalkeeperIndex, 1);
  ordered.unshift(goalkeeper);
  return ordered;
}

function sellerCanRelease(players: PlayerCard[], playerId: string): boolean {
  const player = players.find((item) => item.id === playerId);
  if (!player) return false;

  const remaining = players.filter((item) => item.id !== playerId);
  return (
    remaining.length >= MIN_MATCH_SQUAD_SIZE &&
    remaining.some((item) => item.role === "goalkeeper")
  );
}

function buyerCanRegister(
  players: PlayerCard[],
  finance: ClubFinance | undefined,
  player: PlayerCard,
  amount: number,
): string | null {
  if (!finance) return "The buying club has no finance record.";
  if (players.length >= MAX_SQUAD_SIZE)
    return "The buying squad is already full.";
  if (amount > finance.budget) return "The buying club cannot afford the fee.";

  const wage = player.weeklyWage ?? 0;
  if (finance.payroll + wage > finance.wageBudget) {
    return "The buying club has no room in its wage budget.";
  }

  return null;
}

function currentOfferAmount(offer: TransferOffer): number {
  return Math.max(0, Math.round(offer.counterAmount ?? offer.amount));
}

function askingPrice(player: PlayerCard): number {
  return Math.max(
    250_000,
    Math.round(player.askingPrice ?? player.marketValue ?? 1_000_000),
  );
}

function transferThreshold(player: PlayerCard): number {
  const ask = askingPrice(player);

  if (player.marketStatus === "listed") return Math.round(ask * 0.9);
  if (player.marketStatus === "available") return Math.round(ask * 1.08);

  return Number.POSITIVE_INFINITY;
}

export function createTransferMarket(
  team: TeamConfig,
  league: LeagueState,
): TransferMarketState {
  const clubs = allClubPlayers(team, league);
  const finances: Record<string, ClubFinance> = {};

  clubs.forEach((club, index) => {
    const currentPayroll = payroll(club.players);
    finances[club.id] = {
      clubId: club.id,
      budget: baseBudgets[index] ?? 20_000_000,
      wageBudget: currentPayroll * 1.35 + 50_000,
      payroll: currentPayroll,
      sales: 0,
      purchases: 0,
      prizeMoney: 0,
    };
  });

  const state: TransferMarketState = {
    version: 3,
    season: league.season ?? 1,
    week: league.trainingWeek ?? 0,
    finances,
    offers: [],
    transactions: [],
    news: [],
    newsFeed: [],
    clubHistory: {},
    playerCareers: {},
    seasonReports: [],
  };

  return addNews(
    state,
    "Transfer department created. Season 1 is scouting-only.",
    { kind: "system" },
  );
}

export function loadTransferMarket(
  team: TeamConfig,
  league: LeagueState,
): TransferMarketState {
  try {
    const raw = localStorage.getItem(KEY);

    if (raw) {
      return normalizeMarket(
        JSON.parse(raw) as TransferMarketState,
        team,
        league,
      );
    }
  } catch {}

  return createTransferMarket(team, league);
}

export function saveTransferMarket(state: TransferMarketState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function normalizeMarket(
  state: TransferMarketState,
  team: TeamConfig,
  league: LeagueState,
): TransferMarketState {
  const clubs = allClubPlayers(team, league);
  const finances = { ...(state.finances ?? {}) };

  clubs.forEach((club, index) => {
    const old = finances[club.id];
    const currentPayroll = payroll(club.players);

    finances[club.id] = {
      clubId: club.id,
      budget: old?.budget ?? baseBudgets[index] ?? 20_000_000,
      wageBudget: old?.wageBudget ?? currentPayroll * 1.35 + 50_000,
      payroll: currentPayroll,
      sales: old?.sales ?? 0,
      purchases: old?.purchases ?? 0,
      prizeMoney: old?.prizeMoney ?? 0,
    };
  });

  const offers = (state.offers ?? []).map((offer) => ({
    ...offer,
    amount: Math.max(0, Math.round(offer.amount ?? 0)),
    createdSeason: Math.max(
      1,
      Math.round(offer.createdSeason ?? state.season ?? league.season ?? 1),
    ),
    createdWeek: Math.max(0, Math.round(offer.createdWeek ?? 0)),
    status: validOfferStatus(offer.status) ? offer.status : "pending",
  }));

  const season = league.season ?? state.season ?? 1;
  const week = league.trainingWeek ?? state.week ?? 0;
  const legacyNews = Array.isArray(state.news) ? state.news : [];
  const newsFeed =
    Array.isArray(state.newsFeed) && state.newsFeed.length > 0
      ? state.newsFeed
          .filter((item) => item && typeof item.headline === "string")
          .slice(0, MAX_NEWS_ITEMS)
          .map((item, index) => ({
            ...item,
            id: item.id || `migrated_news_${season}_${week}_${index}`,
            kind: item.kind ?? inferNewsKind(item.headline),
            season: Math.max(1, Math.round(item.season ?? season)),
            week: Math.max(0, Math.round(item.week ?? week)),
          }))
      : legacyNews.slice(0, MAX_NEWS_ITEMS).map((headline, index) => ({
          id: `legacy_news_${season}_${week}_${index}`,
          kind: inferNewsKind(headline),
          headline,
          season,
          week,
        }));

  const playerCareers: Record<string, PlayerCareerEntry[]> = Object.fromEntries(
    Object.entries(state.playerCareers ?? {}).map(([playerId, entries]) => [
      playerId,
      Array.isArray(entries) ? entries.slice(0, MAX_CAREER_ITEMS) : [],
    ]),
  );

  for (const transaction of state.transactions ?? []) {
    const existing = playerCareers[transaction.playerId] ?? [];
    const careerId = `career_${transaction.id}`;

    if (existing.some((entry) => entry.id === careerId)) continue;

    const migratedCareer: PlayerCareerEntry = {
      id: careerId,
      type: "transfer",
      season: transaction.season,
      week: transaction.week,
      clubId: transaction.buyerId,
      clubName: transaction.buyerName,
      fromClubId: transaction.sellerId,
      fromClubName: transaction.sellerName,
      toClubId: transaction.buyerId,
      toClubName: transaction.buyerName,
      fee: transaction.amount,
    };

    playerCareers[transaction.playerId] = [migratedCareer, ...existing].slice(
      0,
      MAX_CAREER_ITEMS,
    );
  }

  return {
    version: 3,
    season,
    week,
    finances,
    offers,
    transactions: state.transactions ?? [],
    news: legacyNews,
    newsFeed,
    clubHistory: Object.fromEntries(
      Object.entries(state.clubHistory ?? {}).map(([clubId, entries]) => [
        clubId,
        Array.isArray(entries) ? entries.slice(0, MAX_CLUB_HISTORY_ITEMS) : [],
      ]),
    ),
    playerCareers,
    seasonReports: Array.isArray(state.seasonReports)
      ? state.seasonReports.slice(0, MAX_CLUB_HISTORY_ITEMS)
      : [],
  };
}

export function setPlayerMarketStatus(
  team: TeamConfig,
  playerId: string,
  status: NonNullable<PlayerCard["marketStatus"]>,
  nextAskingPrice?: number,
): TeamConfig {
  return {
    ...team,
    players: team.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            marketStatus: status,
            askingPrice: status === "listed" ? nextAskingPrice : undefined,
          }
        : player,
    ),
  };
}

export function placeUserOffer(
  rawState: TransferMarketState,
  team: TeamConfig,
  league: LeagueState,
  requestedPlayer: PlayerCard,
  sellerId: string,
  sellerName: string,
  requestedAmount: number,
): TransferMarketState {
  let state = normalizeMarket(rawState, team, league);

  if ((league.season ?? 1) <= 1) {
    return addNews(state, "Offers unlock in Season 2.");
  }

  const seller = allClubPlayers(team, league).find(
    (club) => club.id === sellerId,
  );
  const player = seller?.players.find((item) => item.id === requestedPlayer.id);

  if (!seller || !player) {
    return addNews(
      state,
      "Offer blocked: that player is no longer at the club.",
    );
  }

  if (
    player.marketStatus === "untouchable" ||
    player.marketStatus === "not_for_sale"
  ) {
    return addNews(state, `${player.name} is not available for transfer.`);
  }

  if (!sellerCanRelease(seller.players, player.id)) {
    return addNews(
      state,
      `Offer blocked: ${seller.name} must keep six players and a goalkeeper.`,
    );
  }

  const amount = Math.max(0, Math.round(requestedAmount));
  const finance = state.finances[PLAYER_ID];
  const registrationError = buyerCanRegister(
    team.players,
    finance,
    player,
    amount,
  );

  if (registrationError) {
    return addNews(state, `Offer blocked: ${registrationError}`);
  }

  const duplicate = state.offers.some(
    (offer) =>
      offer.playerId === player.id &&
      offer.fromClubId === PLAYER_ID &&
      isActiveOffer(offer),
  );

  if (duplicate) {
    return addNews(state, `You already have an active bid for ${player.name}.`);
  }

  const week = league.trainingWeek ?? 0;
  const offer: TransferOffer = {
    id: `offer_${Date.now()}_${Math.random()}`,
    playerId: player.id,
    playerName: player.name,
    fromClubId: PLAYER_ID,
    fromClubName: team.name,
    toClubId: sellerId,
    toClubName: sellerName,
    amount,
    createdSeason: league.season ?? state.season,
    createdWeek: week,
    lastUpdatedWeek: week,
    status: "pending",
  };

  state = {
    ...state,
    offers: [offer, ...state.offers],
  };

  return addNews(
    state,
    `${team.name} bid $${Math.round(amount / 1_000_000)}M for ${player.name}.`,
    {
      kind: "offer",
      playerId: player.id,
      clubIds: [PLAYER_ID, sellerId],
      amount,
    },
  );
}

function replaceInSquads(
  team: TeamConfig,
  league: LeagueState,
  playerId: string,
  buyerId: string,
  sellerId: string,
): {
  team: TeamConfig;
  league: LeagueState;
  player?: PlayerCard;
} {
  let bought: PlayerCard | undefined;
  const nextTeam: TeamConfig = {
    ...team,
    players: [...team.players],
  };
  const aiSquads = { ...(league.aiSquads ?? {}) };

  if (sellerId === PLAYER_ID) {
    bought = nextTeam.players.find((player) => player.id === playerId);
    nextTeam.players = keepGoalkeeperFirst(
      nextTeam.players.filter((player) => player.id !== playerId),
    );
  } else {
    const sellerSquad = [...(aiSquads[sellerId] ?? aiBaseSquad(sellerId))];
    bought = sellerSquad.find((player) => player.id === playerId);
    aiSquads[sellerId] = keepGoalkeeperFirst(
      sellerSquad.filter((player) => player.id !== playerId),
    );
  }

  if (!bought) return { team, league };

  const moved: PlayerCard = {
    ...bought,
    clubId: buyerId,
    marketStatus: "available",
    askingPrice: undefined,
  };

  if (buyerId === PLAYER_ID) {
    nextTeam.players = keepGoalkeeperFirst([...nextTeam.players, moved]);
  } else {
    aiSquads[buyerId] = keepGoalkeeperFirst([
      ...(aiSquads[buyerId] ?? aiBaseSquad(buyerId)),
      moved,
    ]);
  }

  return {
    team: nextTeam,
    league: { ...league, aiSquads },
    player: moved,
  };
}

function completeTransfer(
  state: TransferMarketState,
  team: TeamConfig,
  league: LeagueState,
  offer: TransferOffer,
): TransferActionResult {
  const clubs = allClubPlayers(team, league);
  const seller = clubs.find((club) => club.id === offer.toClubId);
  const buyer = clubs.find((club) => club.id === offer.fromClubId);
  const player = seller?.players.find((item) => item.id === offer.playerId);
  const amount = currentOfferAmount(offer);

  if (!seller || !buyer || !player) {
    const next = {
      ...state,
      offers: state.offers.map(
        (item): TransferOffer =>
          item.id === offer.id ? { ...item, status: "withdrawn" } : item,
      ),
    };
    return {
      state: addNews(next, `${offer.playerName} is no longer available.`),
      team,
      league,
    };
  }

  if (!sellerCanRelease(seller.players, player.id)) {
    const next = {
      ...state,
      offers: state.offers.map(
        (item): TransferOffer =>
          item.id === offer.id ? { ...item, status: "rejected" } : item,
      ),
    };
    return {
      state: addNews(
        next,
        `${seller.name} rejected the deal to protect its match squad.`,
      ),
      team,
      league,
    };
  }

  const buyerFinance = state.finances[offer.fromClubId];
  const sellerFinance = state.finances[offer.toClubId];
  const registrationError = buyerCanRegister(
    buyer.players,
    buyerFinance,
    player,
    amount,
  );

  if (!buyerFinance || !sellerFinance || registrationError) {
    const next = {
      ...state,
      offers: state.offers.map(
        (item): TransferOffer =>
          item.id === offer.id ? { ...item, status: "withdrawn" } : item,
      ),
    };
    return {
      state: addNews(
        next,
        `${offer.fromClubName} could not complete the ${offer.playerName} deal: ${
          registrationError ?? "finance record missing"
        }`,
      ),
      team,
      league,
    };
  }

  const moved = replaceInSquads(
    team,
    league,
    offer.playerId,
    offer.fromClubId,
    offer.toClubId,
  );

  if (!moved.player) {
    return {
      state: addNews(state, `${offer.playerName} could not be registered.`),
      team,
      league,
    };
  }

  const wage = moved.player.weeklyWage ?? 0;
  const finances: Record<string, ClubFinance> = {
    ...state.finances,
    [offer.fromClubId]: {
      ...buyerFinance,
      budget: buyerFinance.budget - amount,
      payroll: buyerFinance.payroll + wage,
      purchases: buyerFinance.purchases + amount,
    },
    [offer.toClubId]: {
      ...sellerFinance,
      budget: sellerFinance.budget + amount,
      payroll: Math.max(0, sellerFinance.payroll - wage),
      sales: sellerFinance.sales + amount,
    },
  };

  const week = league.trainingWeek ?? state.week;
  const transaction: TransferTransaction = {
    id: `transfer_${Date.now()}_${Math.random()}`,
    playerId: offer.playerId,
    playerName: offer.playerName,
    buyerId: offer.fromClubId,
    buyerName: offer.fromClubName,
    sellerId: offer.toClubId,
    sellerName: offer.toClubName,
    amount,
    season: league.season ?? state.season,
    week,
  };

  const offers = state.offers.map((item): TransferOffer => {
    if (item.id === offer.id) {
      return {
        ...item,
        status: "completed",
        lastUpdatedWeek: week,
      };
    }

    if (
      item.playerId === offer.playerId &&
      item.toClubId === offer.toClubId &&
      isActiveOffer(item)
    ) {
      return {
        ...item,
        status: "withdrawn",
        lastUpdatedWeek: week,
      };
    }

    return item;
  });

  const nextState: TransferMarketState = {
    ...state,
    finances,
    offers,
    transactions: [transaction, ...state.transactions].slice(
      0,
      MAX_TRANSACTIONS,
    ),
    playerCareers: {
      ...state.playerCareers,
      [offer.playerId]: [
        {
          id: `career_${transaction.id}`,
          type: "transfer" as const,
          season: transaction.season,
          week: transaction.week,
          clubId: offer.fromClubId,
          clubName: offer.fromClubName,
          overall: getPlayerOverall(moved.player),
          marketValue: moved.player.marketValue,
          fromClubId: offer.toClubId,
          fromClubName: offer.toClubName,
          toClubId: offer.fromClubId,
          toClubName: offer.fromClubName,
          fee: amount,
        },
        ...(state.playerCareers[offer.playerId] ?? []),
      ].slice(0, MAX_CAREER_ITEMS),
    },
  };

  return {
    state: addNews(
      nextState,
      `${offer.playerName} transferred from ${offer.toClubName} to ${
        offer.fromClubName
      } for $${Math.round(amount / 1_000_000)}M.`,
      {
        kind: "transfer",
        playerId: offer.playerId,
        clubIds: [offer.toClubId, offer.fromClubId],
        amount,
      },
    ),
    team: moved.team,
    league: moved.league,
  };
}

export function respondToOffer(
  rawState: TransferMarketState,
  team: TeamConfig,
  league: LeagueState,
  offerId: string,
  action: "accept" | "reject" | "counter" | "withdraw",
  requestedCounterAmount?: number,
): TransferActionResult {
  const state = normalizeMarket(rawState, team, league);
  const offer = state.offers.find((item) => item.id === offerId);

  if (!offer || !isActiveOffer(offer)) {
    return { state, team, league };
  }

  const week = league.trainingWeek ?? state.week;

  if (action === "reject" || action === "withdraw") {
    const status: OfferStatus = action === "reject" ? "rejected" : "withdrawn";
    const next: TransferMarketState = {
      ...state,
      offers: state.offers.map(
        (item): TransferOffer =>
          item.id === offerId
            ? { ...item, status, lastUpdatedWeek: week }
            : item,
      ),
    };

    return {
      state: addNews(
        next,
        action === "reject"
          ? `${offer.playerName} offer rejected.`
          : `${offer.playerName} offer withdrawn.`,
      ),
      team,
      league,
    };
  }

  if (action === "counter") {
    const counterAmount = Math.max(
      250_000,
      Math.round(requestedCounterAmount ?? offer.amount),
    );
    const next: TransferMarketState = {
      ...state,
      offers: state.offers.map(
        (item): TransferOffer =>
          item.id === offerId
            ? {
                ...item,
                status: "countered",
                counterAmount,
                counteredByClubId: PLAYER_ID,
                lastUpdatedWeek: week,
              }
            : item,
      ),
    };

    return {
      state: addNews(next, `${team.name} countered for ${offer.playerName}.`, {
        kind: "negotiation",
        playerId: offer.playerId,
        clubIds: [offer.fromClubId, offer.toClubId],
        amount: counterAmount,
      }),
      team,
      league,
    };
  }

  return completeTransfer(state, team, league, offer);
}

function rejectOffer(
  state: TransferMarketState,
  offer: TransferOffer,
  message: string,
  week: number,
): TransferMarketState {
  const next: TransferMarketState = {
    ...state,
    offers: state.offers.map(
      (item): TransferOffer =>
        item.id === offer.id
          ? { ...item, status: "rejected", lastUpdatedWeek: week }
          : item,
    ),
  };
  return addNews(next, message);
}

function counterOffer(
  state: TransferMarketState,
  offer: TransferOffer,
  counterAmount: number,
  counteredByClubId: string,
  message: string,
  week: number,
): TransferMarketState {
  const next: TransferMarketState = {
    ...state,
    offers: state.offers.map(
      (item): TransferOffer =>
        item.id === offer.id
          ? {
              ...item,
              status: "countered",
              counterAmount: Math.round(counterAmount),
              counteredByClubId,
              lastUpdatedWeek: week,
            }
          : item,
    ),
  };
  return addNews(next, message);
}

function offerDecisionDelayWeeks(offer: TransferOffer, player: PlayerCard): number {
  // Every outside club waits at least one full week. Strong bids can still be
  // held for another week or two while the seller waits for competition.
  const seed = [...`${offer.id}:${player.id}:${offer.createdSeason ?? 1}`]
    .reduce((total, char) => Math.imul(total ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const amount = currentOfferAmount(offer);
  const threshold = transferThreshold(player);
  if (amount >= threshold * 1.18) return 1;
  if (amount >= threshold) return 1 + (seed % 2);
  return 1 + (seed % 3);
}

function resolveExistingOffers(
  state: TransferMarketState,
  team: TeamConfig,
  league: LeagueState,
): TransferActionResult {
  let nextState = state;
  let nextTeam = team;
  let nextLeague = league;
  const week = league.trainingWeek ?? 0;

  const candidates = state.offers.filter((offer) => {
    if (!isActiveOffer(offer)) return false;
    const clubs = allClubPlayers(team, league);
    const seller = clubs.find((club) => club.id === offer.toClubId);
    const player = seller?.players.find((item) => item.id === offer.playerId);
    if (!player) return true;
    const referenceWeek = offer.lastUpdatedWeek ?? offer.createdWeek;
    return week - referenceWeek >= offerDecisionDelayWeeks(offer, player);
  });

  for (const original of candidates) {
    const offer = nextState.offers.find((item) => item.id === original.id);
    if (!offer || !isActiveOffer(offer)) continue;

    const clubs = allClubPlayers(nextTeam, nextLeague);
    const seller = clubs.find((club) => club.id === offer.toClubId);
    const buyer = clubs.find((club) => club.id === offer.fromClubId);
    const player = seller?.players.find((item) => item.id === offer.playerId);

    if (!seller || !buyer || !player) {
      nextState = rejectOffer(
        nextState,
        offer,
        `${offer.playerName} is no longer available.`,
        week,
      );
      continue;
    }

    if (
      offer.fromClubId === PLAYER_ID &&
      (offer.status === "pending" || offer.counteredByClubId === PLAYER_ID)
    ) {
      if (
        player.marketStatus === "untouchable" ||
        player.marketStatus === "not_for_sale" ||
        !sellerCanRelease(seller.players, player.id)
      ) {
        nextState = rejectOffer(
          nextState,
          offer,
          `${seller.name} rejected the offer for ${player.name}.`,
          week,
        );
        continue;
      }

      const amount = currentOfferAmount(offer);
      const threshold = transferThreshold(player);

      if (amount >= threshold) {
        const result = completeTransfer(nextState, nextTeam, nextLeague, offer);
        nextState = result.state;
        nextTeam = result.team;
        nextLeague = result.league;
      } else if (amount >= threshold * 0.75) {
        nextState = counterOffer(
          nextState,
          offer,
          threshold,
          seller.id,
          `${seller.name} countered for ${player.name}.`,
          week,
        );
      } else {
        nextState = rejectOffer(
          nextState,
          offer,
          `${seller.name} rejected the offer for ${player.name}.`,
          week,
        );
      }

      continue;
    }

    if (
      offer.toClubId === PLAYER_ID &&
      offer.status === "countered" &&
      offer.counteredByClubId === PLAYER_ID
    ) {
      const amount = currentOfferAmount(offer);
      const buyerFinance = nextState.finances[offer.fromClubId];
      const registrationError = buyerCanRegister(
        buyer.players,
        buyerFinance,
        player,
        amount,
      );
      const maxNegotiatedFee = Math.max(
        Math.round((player.marketValue ?? askingPrice(player)) * 1.2),
        Math.round(offer.amount * 1.18),
      );

      if (!registrationError && amount <= maxNegotiatedFee) {
        const result = completeTransfer(nextState, nextTeam, nextLeague, offer);
        nextState = result.state;
        nextTeam = result.team;
        nextLeague = result.league;
      } else {
        nextState = rejectOffer(
          nextState,
          offer,
          `${offer.fromClubName} walked away from the ${player.name} negotiation.`,
          week,
        );
      }
    }
  }

  return {
    state: nextState,
    team: nextTeam,
    league: nextLeague,
  };
}

type RoleBucket = "goalkeeper" | "defender" | "midfielder" | "attacker";

function roleBucket(player: PlayerCard): RoleBucket {
  if (player.role === "goalkeeper") return "goalkeeper";
  if (player.role === "defender") return "defender";
  if (player.role === "midfielder") return "midfielder";
  return "attacker";
}

function desiredRoleCount(bucket: RoleBucket, squadSize: number): number {
  if (bucket === "goalkeeper") return squadSize >= 13 ? 2 : 1;
  if (bucket === "defender") return Math.max(3, Math.round(squadSize * 0.3));
  if (bucket === "midfielder") return Math.max(3, Math.round(squadSize * 0.3));
  return Math.max(3, Math.round(squadSize * 0.28));
}

function targetScore(
  buyerPlayers: PlayerCard[],
  player: PlayerCard,
  fee: number,
): number {
  const bucket = roleBucket(player);
  const sameRole = buyerPlayers.filter((item) => roleBucket(item) === bucket);
  const shortage = Math.max(
    0,
    desiredRoleCount(bucket, buyerPlayers.length + 1) - sameRole.length,
  );
  const averageOverall =
    sameRole.reduce((sum, item) => sum + getPlayerOverall(item), 0) /
    Math.max(1, sameRole.length);
  const upgrade = getPlayerOverall(player) - averageOverall;
  const potential = player.potential ?? getPlayerOverall(player);
  const value = player.marketValue ?? fee;
  const valueScore = value > 0 ? Math.min(12, (value / fee) * 6) : 0;

  return (
    shortage * 40 +
    upgrade * 4 +
    potential * 0.12 +
    valueScore +
    Math.random() * 8
  );
}

function createAIOffer(
  state: TransferMarketState,
  buyer: MarketClub,
  seller: MarketClub,
  player: PlayerCard,
  amount: number,
  league: LeagueState,
): TransferMarketState {
  const week = league.trainingWeek ?? 0;
  const offer: TransferOffer = {
    id: `ai_${Date.now()}_${Math.random()}`,
    playerId: player.id,
    playerName: player.name,
    fromClubId: buyer.id,
    fromClubName: buyer.name,
    toClubId: seller.id,
    toClubName: seller.name,
    amount: Math.round(amount),
    createdSeason: league.season ?? state.season,
    createdWeek: week,
    lastUpdatedWeek: week,
    status: "pending",
  };

  return {
    ...state,
    offers: [offer, ...state.offers],
  };
}

function generateAIMarketActivity(
  state: TransferMarketState,
  team: TeamConfig,
  league: LeagueState,
): TransferActionResult {
  let nextState = state;
  let nextTeam = team;
  let nextLeague = league;
  let aiToAiTransfers = 0;

  for (const aiDefinition of AI_TEAMS) {
    if (Math.random() > 0.42) continue;

    const clubs = allClubPlayers(nextTeam, nextLeague);
    const buyer = clubs.find((club) => club.id === aiDefinition.id);
    if (!buyer || buyer.players.length >= MAX_SQUAD_SIZE) continue;

    const finance = nextState.finances[buyer.id];
    if (!finance) continue;

    const candidates = clubs
      .filter((seller) => seller.id !== buyer.id)
      .flatMap((seller) => seller.players.map((player) => ({ player, seller })))
      .filter(({ player, seller }) => {
        if (player.marketStatus !== "listed") return false;
        if (!sellerCanRelease(seller.players, player.id)) return false;

        const fee = askingPrice(player);
        if (fee > finance.budget * 0.7) return false;

        const registrationError = buyerCanRegister(
          buyer.players,
          finance,
          player,
          fee,
        );
        if (registrationError) return false;

        return !nextState.offers.some(
          (offer) =>
            offer.playerId === player.id &&
            offer.fromClubId === buyer.id &&
            isActiveOffer(offer),
        );
      })
      .map(({ player, seller }) => {
        const fee = askingPrice(player);
        return {
          player,
          seller,
          fee,
          score: targetScore(buyer.players, player, fee),
        };
      })
      .sort((a, b) => b.score - a.score);

    const target = candidates[0];
    if (!target) continue;

    const amount = Math.round(target.fee * (0.9 + Math.random() * 0.18));
    nextState = createAIOffer(
      nextState,
      buyer,
      target.seller,
      target.player,
      amount,
      nextLeague,
    );

    const createdOffer = nextState.offers[0];

    if (target.seller.id === PLAYER_ID) {
      nextState = addNews(
        nextState,
        `${buyer.name} bid ${Math.round(amount / 1_000_000)}M for ${
          target.player.name
        }.`,
        {
          kind: "offer",
          playerId: target.player.id,
          clubIds: [buyer.id, PLAYER_ID],
          amount,
        },
      );
      continue;
    }

    if (aiToAiTransfers >= 2) continue;

    if (amount >= transferThreshold(target.player)) {
      const result = completeTransfer(
        nextState,
        nextTeam,
        nextLeague,
        createdOffer,
      );
      nextState = result.state;
      nextTeam = result.team;
      nextLeague = result.league;
      aiToAiTransfers += 1;
    } else {
      nextState = rejectOffer(
        nextState,
        createdOffer,
        `${target.seller.name} rejected ${buyer.name}'s bid for ${target.player.name}.`,
        nextLeague.trainingWeek ?? 0,
      );
    }
  }

  return {
    state: nextState,
    team: nextTeam,
    league: nextLeague,
  };
}

export function processTransferWeek(
  rawState: TransferMarketState,
  team: TeamConfig,
  league: LeagueState,
): TransferActionResult {
  const state = normalizeMarket(rawState, team, league);
  const season = league.season ?? 1;

  if (season <= 1) {
    return {
      state: {
        ...state,
        week: league.trainingWeek ?? state.week,
      },
      team,
      league,
    };
  }

  const resolved = resolveExistingOffers(state, team, league);
  const generated = generateAIMarketActivity(
    resolved.state,
    resolved.team,
    resolved.league,
  );

  return {
    ...generated,
    state: {
      ...generated.state,
      season,
      week: league.trainingWeek ?? generated.state.week,
    },
  };
}

function seasonEndSquad(
  team: TeamConfig | undefined,
  league: LeagueState,
  clubId: string,
): PlayerCard[] {
  if (clubId === PLAYER_ID) return team?.players ?? [];
  return league.aiSquads?.[clubId] ?? aiBaseSquad(clubId);
}

function clubSeasonOutcome(
  league: LeagueState,
  clubId: string,
): ClubSeasonOutcome {
  const playoff = league.playoff;

  if (playoff?.champion === clubId) return "Champion";

  if (playoff?.final) {
    const finalist =
      playoff.final.homeId === clubId || playoff.final.awayId === clubId;
    if (finalist) return "Runner-up";
  }

  if (playoff?.top4?.includes(clubId)) return "Playoff semifinal";

  return "League season";
}

export function awardSeasonPrize(
  state: TransferMarketState,
  league: LeagueState,
  team?: TeamConfig,
): TransferMarketState {
  const season = Math.max(1, Math.round(league.season ?? state.season));

  if ((state.seasonReports ?? []).some((report) => report.season === season)) {
    return state;
  }

  const sorted = [...league.teams].sort(
    (a, b) =>
      b.won * 3 + b.drawn - (a.won * 3 + a.drawn) ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst),
  );
  const finances = { ...state.finances };
  const clubHistory: Record<string, ClubSeasonHistoryEntry[]> =
    Object.fromEntries(
      Object.entries(state.clubHistory ?? {}).map(([clubId, entries]) => [
        clubId,
        [...entries],
      ]),
    );
  const playerCareers: Record<string, PlayerCareerEntry[]> = Object.fromEntries(
    Object.entries(state.playerCareers ?? {}).map(([playerId, entries]) => [
      playerId,
      [...entries],
    ]),
  );
  const seasonTransactions = state.transactions.filter(
    (transaction) => transaction.season === season,
  );
  const historyEntries: ClubSeasonHistoryEntry[] = [];
  const standoutCandidates: SeasonStandout[] = [];

  sorted.forEach((entry, index) => {
    const finance = finances[entry.id];
    const prize = prizeByPlace[index] ?? 5_000_000;
    const nextFinance: ClubFinance = {
      clubId: entry.id,
      budget: (finance?.budget ?? 0) + prize,
      wageBudget: finance?.wageBudget ?? 0,
      payroll: finance?.payroll ?? 0,
      sales: finance?.sales ?? 0,
      purchases: finance?.purchases ?? 0,
      prizeMoney: (finance?.prizeMoney ?? 0) + prize,
    };
    finances[entry.id] = nextFinance;

    const squad = seasonEndSquad(team, league, entry.id);
    const arrivals = seasonTransactions.filter(
      (transaction) => transaction.buyerId === entry.id,
    );
    const departures = seasonTransactions.filter(
      (transaction) => transaction.sellerId === entry.id,
    );
    const historyEntry: ClubSeasonHistoryEntry = {
      season,
      clubId: entry.id,
      clubName: entry.name,
      finalPosition: index + 1,
      points: entry.won * 3 + entry.drawn,
      played: entry.played,
      won: entry.won,
      drawn: entry.drawn,
      lost: entry.lost,
      goalsFor: entry.goalsFor,
      goalsAgainst: entry.goalsAgainst,
      goalDifference: entry.goalsFor - entry.goalsAgainst,
      outcome: clubSeasonOutcome(league, entry.id),
      prizeMoney: prize,
      transfersIn: arrivals.length,
      transfersOut: departures.length,
      transferSpent: arrivals.reduce(
        (sum, transaction) => sum + transaction.amount,
        0,
      ),
      transferReceived: departures.reduce(
        (sum, transaction) => sum + transaction.amount,
        0,
      ),
      endingBudget: nextFinance.budget,
      payroll: nextFinance.payroll,
      squadValue: squad.reduce(
        (sum, player) => sum + (player.marketValue ?? 0),
        0,
      ),
    };

    historyEntries.push(historyEntry);
    clubHistory[entry.id] = [
      historyEntry,
      ...(clubHistory[entry.id] ?? []).filter((item) => item.season !== season),
    ].slice(0, MAX_CLUB_HISTORY_ITEMS);

    squad.forEach((player) => {
      const existing = playerCareers[player.id] ?? [];
      const careerId = `career_season_${season}_${entry.id}_${player.id}`;
      const careerEntry: PlayerCareerEntry = {
        id: careerId,
        type: "season",
        season,
        week: league.trainingWeek ?? league.schedule.length,
        clubId: entry.id,
        clubName: entry.name,
        overall: getPlayerOverall(player),
        marketValue: player.marketValue,
      };

      if (!existing.some((item) => item.id === careerId)) {
        playerCareers[player.id] = [careerEntry, ...existing].slice(
          0,
          MAX_CAREER_ITEMS,
        );
      }

      standoutCandidates.push({
        playerId: player.id,
        playerName: player.name,
        clubId: entry.id,
        clubName: entry.name,
        overall: getPlayerOverall(player),
        seasonGrowth: player.development?.seasonGrowth ?? 0,
      });
    });
  });

  const championId = league.playoff?.champion ?? sorted[0]?.id ?? PLAYER_ID;
  const championName =
    league.playoff?.championName ??
    sorted.find((entry) => entry.id === championId)?.name ??
    championId;
  const playerFinish =
    sorted.findIndex((entry) => entry.id === PLAYER_ID) + 1 || sorted.length;
  const biggestTransfer = [...seasonTransactions].sort(
    (a, b) => b.amount - a.amount,
  )[0];
  const standout = [...standoutCandidates].sort(
    (a, b) =>
      b.seasonGrowth - a.seasonGrowth ||
      b.overall - a.overall ||
      a.playerName.localeCompare(b.playerName),
  )[0];
  const report: SeasonReport = {
    id: `season_report_${season}`,
    season,
    championId,
    championName,
    playerFinish,
    transfersCompleted: seasonTransactions.length,
    totalTransferValue: seasonTransactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0,
    ),
    biggestTransfer,
    standout,
    clubs: historyEntries,
  };
  const archived: TransferMarketState = {
    ...state,
    version: 3,
    season,
    week: league.trainingWeek ?? state.week,
    finances,
    clubHistory,
    playerCareers,
    seasonReports: [
      report,
      ...(state.seasonReports ?? []).filter((item) => item.season !== season),
    ].slice(0, MAX_CLUB_HISTORY_ITEMS),
  };

  return addNews(
    archived,
    `Season ${season} report published. ${championName} are champions and prize money has been added to every club budget.`,
    { kind: "finance", clubIds: [championId] },
  );
}
