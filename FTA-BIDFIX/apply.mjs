import fs from 'node:fs';
import path from 'node:path';

const root = process.env.FTA_PROJECT || path.join(process.cwd(), 'artifacts', 'fta-game');
const file = path.join(root, 'src', 'game', 'transferMarket.ts');

if (!fs.existsSync(file)) {
  throw new Error(`transfer market file not found: ${file}`);
}

let text = fs.readFileSync(file, 'utf8');
const original = text;
let changes = 0;

// Long-career finance repair: wages grow with player development, but the old
// wageBudget was frozen forever at the value from the first market creation.
// Eventually payroll catches it and every transfer is rejected. Keep a 35%
// registration cushion above the CURRENT payroll while preserving larger
// budgets the club may already have.
const oldWage = 'wageBudget: old?.wageBudget ?? currentPayroll * 1.35 + 50_000,';
const newWage = 'wageBudget: Math.max(old?.wageBudget ?? 0, currentPayroll * 1.35 + 50_000),';
if (text.includes(oldWage)) {
  text = text.replace(oldWage, newWage);
  changes++;
} else if (!text.includes(newWage)) {
  throw new Error('wage-budget anchor not found');
}

// Long-career offer repair: trainingWeek resets to 0 each season. Pending or
// countered offers from an older season used to remain "active" forever and
// could permanently block future bids for the same player. Normalize any
// prior-season active offer to withdrawn when the market is loaded/synced.
const oldOffers = `  const offers = (state.offers ?? []).map((offer) => ({\n    ...offer,\n    amount: Math.max(0, Math.round(offer.amount ?? 0)),\n    createdSeason: Math.max(\n      1,\n      Math.round(offer.createdSeason ?? state.season ?? league.season ?? 1),\n    ),\n    createdWeek: Math.max(0, Math.round(offer.createdWeek ?? 0)),\n    status: validOfferStatus(offer.status) ? offer.status : "pending",\n  }));\n\n  const season = league.season ?? state.season ?? 1;\n  const week = league.trainingWeek ?? state.week ?? 0;`;

const newOffers = `  const marketSeason = Math.max(\n    1,\n    Math.round(league.season ?? state.season ?? 1),\n  );\n  const marketWeek = Math.max(\n    0,\n    Math.round(league.trainingWeek ?? state.week ?? 0),\n  );\n  const offers = (state.offers ?? []).map((offer): TransferOffer => {\n    const createdSeason = Math.max(\n      1,\n      Math.round(offer.createdSeason ?? state.season ?? marketSeason),\n    );\n    const normalizedStatus: OfferStatus = validOfferStatus(offer.status)\n      ? offer.status\n      : "pending";\n    const status: OfferStatus =\n      ACTIVE_OFFER_STATUSES.includes(normalizedStatus) &&\n      createdSeason < marketSeason\n        ? "withdrawn"\n        : normalizedStatus;\n\n    return {\n      ...offer,\n      amount: Math.max(0, Math.round(offer.amount ?? 0)),\n      createdSeason,\n      createdWeek: Math.max(0, Math.round(offer.createdWeek ?? 0)),\n      status,\n      lastUpdatedWeek:\n        status === "withdrawn" && normalizedStatus !== "withdrawn"\n          ? marketWeek\n          : offer.lastUpdatedWeek,\n    };\n  });\n\n  const season = marketSeason;\n  const week = marketWeek;`;

if (text.includes(oldOffers)) {
  text = text.replace(oldOffers, newOffers);
  changes++;
} else if (!text.includes('const marketSeason = Math.max(') || !text.includes('createdSeason < marketSeason')) {
  // More tolerant fallback for newer branches: patch the simple offers map
  // and season/week declarations with a regex, preserving unrelated changes.
  const rx = /  const offers = \(state\.offers \?\? \[\]\)\.map\(\(offer\)[\s\S]*?\n  const season = league\.season \?\? state\.season \?\? 1;\n  const week = league\.trainingWeek \?\? state\.week \?\? 0;/;
  if (!rx.test(text)) throw new Error('offer-normalization anchor not found');
  text = text.replace(rx, newOffers);
  changes++;
}

// Belt-and-suspenders: a duplicate active offer should only block another bid
// during the same season. This protects saves that were already deep into a
// career before the normalization repair runs.
const oldDuplicate = `  const duplicate = state.offers.some(\n    (offer) =>\n      offer.playerId === player.id &&\n      offer.fromClubId === PLAYER_ID &&\n      isActiveOffer(offer),\n  );`;
const newDuplicate = `  const currentSeason = league.season ?? state.season;\n  const duplicate = state.offers.some(\n    (offer) =>\n      offer.playerId === player.id &&\n      offer.fromClubId === PLAYER_ID &&\n      (offer.createdSeason ?? currentSeason) === currentSeason &&\n      isActiveOffer(offer),\n  );`;
if (text.includes(oldDuplicate)) {
  text = text.replace(oldDuplicate, newDuplicate);
  changes++;
} else if (!text.includes('(offer.createdSeason ?? currentSeason) === currentSeason')) {
  // Don't fail newer versions that already changed the duplicate logic.
  console.log('Note: duplicate-bid guard already differs; stale-offer normalization still repairs old saves.');
}

if (text === original) {
  console.log('BIDFIX already appears to be applied.');
} else {
  fs.writeFileSync(file, text);
  console.log(`Patched transferMarket.ts (${changes} change groups)`);
}
