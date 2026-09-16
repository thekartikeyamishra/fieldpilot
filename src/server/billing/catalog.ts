import { env } from "@/lib/env";
import { costOf } from "../cost/pricing";

/**
 * What can actually be bought. The catalogue lives on the server and prices are
 * integers in the smallest currency unit, because the client must never be able
 * to tell us what something costs and money must never be a float.
 */
export type Sku = "credits_100" | "credits_400" | "credits_1500";

export type CreditPack = {
  sku: Sku;
  label: string;
  credits: number;
  /** Paise for INR, cents for USD. */
  amountMinor: number;
  currency: string;
};

export const CREDIT_PACKS: Record<Sku, CreditPack> = {
  credits_100: { sku: "credits_100", label: "100 credits", credits: 100, amountMinor: 14900, currency: env.PAYMENTS_CURRENCY },
  credits_400: { sku: "credits_400", label: "400 credits", credits: 400, amountMinor: 49900, currency: env.PAYMENTS_CURRENCY },
  credits_1500: { sku: "credits_1500", label: "1,500 credits", credits: 1500, amountMinor: 179900, currency: env.PAYMENTS_CURRENCY },
};

/**
 * International pricing, in cents.
 *
 * Deliberately NOT the rupee price converted. Three reasons, all of which cost
 * real money if ignored:
 *
 *   1. Square takes roughly 2.9% + 30c per transaction. On a $2 sale the fixed
 *      30c alone is 15% — small packs have to be priced so the fixed fee does
 *      not eat the margin.
 *   2. Cross-border settlement and FX cost another 1-2%.
 *   3. A US or EU buyer's willingness to pay is not an Indian SME's. Charging
 *      them Indian prices is leaving money on the table, not being generous.
 *
 * Every one of these is checked against real provider cost by the margin tests.
 */
export const INTL_CREDIT_PACKS: Record<Sku, CreditPack> = {
  credits_100: { sku: "credits_100", label: "100 credits", credits: 100, amountMinor: 900, currency: env.PAYMENTS_CURRENCY_INTL },
  credits_400: { sku: "credits_400", label: "400 credits", credits: 400, amountMinor: 2900, currency: env.PAYMENTS_CURRENCY_INTL },
  credits_1500: { sku: "credits_1500", label: "1,500 credits", credits: 1500, amountMinor: 9900, currency: env.PAYMENTS_CURRENCY_INTL },
};

export type Region = "IN" | "INTL";

export const packsForRegion = (region: Region): CreditPack[] =>
  Object.values(region === "IN" ? CREDIT_PACKS : INTL_CREDIT_PACKS);

/** Square's published online rate, used to prove margin rather than assume it. */
export const SQUARE_FEE_RATE = 0.029;
export const SQUARE_FEE_FIXED_MINOR = 30;
/** Cross-border settlement and FX, deliberately pessimistic. */
export const CROSS_BORDER_RATE = 0.02;

/** What actually lands in the bank after the provider takes its cut. */
export function netAfterFees(pack: CreditPack): number {
  if (pack.currency === "INR") return Math.round(pack.amountMinor * (1 - 0.02));
  return Math.round(pack.amountMinor * (1 - SQUARE_FEE_RATE - CROSS_BORDER_RATE) - SQUARE_FEE_FIXED_MINOR);
}

export const isSku = (value: string): value is Sku =>
  Object.prototype.hasOwnProperty.call(CREDIT_PACKS, value);

export function packFor(sku: string, region: Region = "IN"): CreditPack {
  if (!isSku(sku)) throw new Error(`unknown sku: ${sku}`);
  return region === "IN" ? CREDIT_PACKS[sku] : INTL_CREDIT_PACKS[sku];
}

/**
 * Region from the currency the buyer is checking out in. Currency is the only
 * thing that actually determines which rail and which price applies — IP
 * geolocation would be guessing, and guessing wrong means charging the wrong
 * price in the wrong currency.
 */
export const regionForCurrency = (currency: string): Region =>
  currency.toUpperCase() === "INR" ? "IN" : "INTL";

export const formatMinor = (amountMinor: number, currency: string) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);

/**
 * Unit economics per pack.
 *
 * Two figures, deliberately separate:
 *   worstCase - every credit spent on the reasoning tier at the largest context
 *               we allow. This is the number that decides whether we may sell.
 *   expected  - the realistic mix. This is the number that tells us whether the
 *               pricing is good, not merely survivable.
 *
 * Note the cost side is derived from the model pricing table, never from
 * CREDIT_PRICE_USD - that is what we charge, and using revenue to justify
 * revenue is how a business talks itself into a loss.
 */

/** A pessimistic INR->USD assumption. Being wrong here makes us look poorer, not richer. */
export const USD_PER_INR_MINOR = 0.00012;

const WORST_CASE_TOKENS = { input: 3000, output: 600 };
const TYPICAL_TOKENS = { input: 1800, output: 300 };
/** Share of paid turns that need the reasoning tier, from the rule/cache split. */
const REASONING_SHARE = 0.3;

function costPerCreditUsd(mode: "worst" | "expected"): number {
  const tokens = mode === "worst" ? WORST_CASE_TOKENS : TYPICAL_TOKENS;
  const reasoningTurn = costOf(env.AI_MODEL_SMART, tokens.input, tokens.output);
  const fastTurn = costOf(env.AI_MODEL_FAST, tokens.input, tokens.output);

  const perReasoningCredit = reasoningTurn / Math.max(1, env.CREDITS_PER_REASONING_TURN);
  const perFastCredit = fastTurn / Math.max(1, env.CREDITS_PER_FAST_TURN);

  if (mode === "worst") return perReasoningCredit;
  return REASONING_SHARE * perReasoningCredit + (1 - REASONING_SHARE) * perFastCredit;
}

export type PackEconomics = {
  revenueUsd: number;
  worstCaseCostUsd: number;
  expectedCostUsd: number;
  worstCaseMarginPct: number;
  expectedMarginPct: number;
};

export function packEconomics(pack: CreditPack, usdPerInrMinor = USD_PER_INR_MINOR): PackEconomics {
  const revenueUsd = pack.currency === "INR" ? pack.amountMinor * usdPerInrMinor : pack.amountMinor / 100;
  const worstCaseCostUsd = pack.credits * costPerCreditUsd("worst");
  const expectedCostUsd = pack.credits * costPerCreditUsd("expected");

  return {
    revenueUsd,
    worstCaseCostUsd,
    expectedCostUsd,
    worstCaseMarginPct: revenueUsd > 0 ? ((revenueUsd - worstCaseCostUsd) / revenueUsd) * 100 : 0,
    expectedMarginPct: revenueUsd > 0 ? ((revenueUsd - expectedCostUsd) / revenueUsd) * 100 : 0,
  };
}

/**
 * The sale gate. A pack must stay profitable even if the customer spends every
 * credit on the most expensive path available to them.
 */
export function packIsProfitable(pack: CreditPack, usdPerInrMinor = USD_PER_INR_MINOR): boolean {
  return packEconomics(pack, usdPerInrMinor).worstCaseMarginPct > 0;
}
