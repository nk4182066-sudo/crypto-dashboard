/**
 * Master Trader Framework — Part 1: knowledge structures and strategy rules.
 *
 * Each trader is modelled as a `TraderProfile`: the belief system they are
 * known for, the knowledge structure they read a chart through, and the
 * concrete strategy rules that follow from it. The profiles are static,
 * published-knowledge summaries — no personal experience or credentials are
 * claimed on the model's behalf.
 *
 * `buildMasterTraderPrompt()` renders the framework for the LLM prompt engine,
 * and `selectTraders()` picks the profiles relevant to the current question so
 * the prompt stays small (Feature 4 — token efficiency).
 */

export type TraderId =
  | "buffett"
  | "soros"
  | "livermore"
  | "jones"
  | "dalio"
  | "simons"
  | "druckenmiller"
  | "oneil";

export type MarketQuestion =
  | "long-term"
  | "psychology"
  | "trend"
  | "risk"
  | "macro"
  | "quant"
  | "swing"
  | "growth";

export interface TraderRule {
  /** Short imperative the model must follow when the rule applies. */
  rule: string;
  /** What a violation looks like, so the model can catch itself. */
  failsWhen: string;
}

export interface TraderProfile {
  id: TraderId;
  name: string;
  /** The headline discipline, used as a heading in the prompt. */
  school: string;
  /** Core belief — the "knowledge structure" the trader reasons from. */
  coreBelief: string;
  /** What the trader looks at first when reading a market. */
  lens: string;
  /** Concrete strategy rules derived from the belief system. */
  rules: TraderRule[];
  /** Which kinds of user question this profile speaks to. */
  appliesTo: MarketQuestion[];
  /** One-line tie-breaker used when profiles conflict. */
  tieBreaker: string;
}

export const traderProfiles: TraderProfile[] = [
  {
    id: "buffett",
    name: "Warren Buffett",
    school: "Value Investing, Long-term",
    coreBelief:
      "Price is only meaningful against intrinsic value. You are buying a business, not a candle, and you hold until the thesis plays out or the facts change.",
    lens: "Business quality and intrinsic value versus price, then a very long holding horizon.",
    rules: [
      { rule: "Ask what the asset is worth before asking where it is going this week.", failsWhen: "A verdict is given with no valuation or thesis statement." },
      { rule: "Prefer a durable margin of safety; a price far above value is a hold, not a buy.", failsWhen: "Price is treated as cheap with no reason it could fall further." },
      { rule: "Hold through noise; do not sell because a chart looks scary.", failsWhen: "A long-term thesis is abandoned on a short timeframe signal." },
      { rule: "Refuse to act when the asset is outside your circle of competence.", failsWhen: "An unfamiliar asset gets a confident recommendation." },
    ],
    appliesTo: ["long-term", "macro"],
    tieBreaker: "If intrinsic value cannot be estimated here, say so rather than guessing a value.",
  },
  {
    id: "soros",
    name: "George Soros",
    school: "Reflexivity, Market Psychology",
    coreBelief:
      "Prices and participants' beliefs feed each other. A biased participant's actions move price, and the new price confirms or breaks the bias — so a thesis must be checked against what the market is actually doing.",
    lens: "Who is positioned, what they believe, and whether their actions are confirming or reversing.",
    rules: [
      { rule: "Look for feedback loops: a trend that attracts participants is self-reinforcing until it breaks.", failsWhen: "A move is explained with no mention of who is driving it." },
      { rule: "Treat a failed reflexively-supported thesis as the exit signal, not an obstacle.", failsWhen: "The original bias is defended against contradicting evidence." },
      { rule: "Expect the crowd to be wrong at the extremes — mass agreement is a warning, not confirmation.", failsWhen: "Popular consensus is treated as proof the trade is safe." },
    ],
    appliesTo: ["psychology", "macro", "trend"],
    tieBreaker: "Positioning beats narrative; if you cannot identify the participants, lower conviction.",
  },
  {
    id: "livermore",
    name: "Jesse Livermore",
    school: "Trend Following, Strict Stop-loss",
    coreBelief:
      "The trend is your friend. The big money accumulates on genuine pullbacks within an existing trend, and money is made by letting winners run while cutting losers immediately.",
    lens: "Trend direction, pullback entry points, and the exact stop level — never the forecast.",
    rules: [
      { rule: "Trade with the dominant trend, entering on pullbacks that hold key trend support.", failsWhen: "A counter-trend trade is proposed without a defined invalidation." },
      { rule: "Place the stop before entry, at a level that would prove the idea wrong.", failsWhen: "No stop, or a stop placed at an arbitrary round number." },
      { rule: "Never average down and never add to a losing position.", failsWhen: "A losing entry is described as being made cheaper." },
      { rule: "Let a winning trend run; exit on a confirmed reversal or breakdown, not on fear.", failsWhen: "A large open profit is suggested to be taken early without reason." },
    ],
    appliesTo: ["trend", "swing"],
    tieBreaker: "No valid stop level means no trade, regardless of how good the trend looks.",
  },
  {
    id: "jones",
    name: "Paul Tudor Jones",
    school: "Risk Management, Defense First",
    coreBelief:
      "You win by not losing. Surviving every drawdown matters more than any single win, so the downside is decided before the position exists.",
    lens: "What can go wrong, how much is at stake, and the exit plan — before any upside is discussed.",
    rules: [
      { rule: "Cap risk per trade at a small fraction of the account; never risk more on a single idea.", failsWhen: "A position size implies risking a large share of the account." },
      { rule: "Define the exit and the invalidation level before entry, and honour it.", failsWhen: "Entry is discussed while the stop is left vague." },
      { rule: "Reduce size when the environment is unclear or volatility is extreme.", failsWhen: "Full size is recommended in a low-conviction regime." },
      { rule: "Keep losses small and cut them fast; protect capital so the next opportunity can be taken.", failsWhen: "A strategy is justified by the potential upside while ignoring the downside." },
    ],
    appliesTo: ["risk", "trend"],
    tieBreaker: "When risk and reward conflict, choose the smaller position; capital preservation wins.",
  },
  {
    id: "dalio",
    name: "Ray Dalio",
    school: "Diversification, Macro",
    coreBelief:
      "Returns come from a balanced mix of economic environments, and most damage comes from concentration in one asset class, one region, or one macro regime.",
    lens: "Which economic regime you are in, and how that regime shifts the behaviour of every asset you hold.",
    rules: [
      { rule: "Judge the whole portfolio, not one position; name the concentration risk.", failsWhen: "A single trade is assessed in isolation." },
      { rule: "Check the macro backdrop — growth, inflation, and liquidity — before taking a directional view.", failsWhen: "A directional call ignores the economic regime." },
      { rule: "Hold uncorrelated exposure so no single shock ends the account.", failsWhen: "The recommendation would multiply existing exposure in the same asset." },
      { rule: "Balance risk parity: volatility should come from many small bets, not a few large ones.", failsWhen: "One idea drives most of the account's risk." },
    ],
    appliesTo: ["macro", "long-term", "risk"],
    tieBreaker: "If the trade only works in one regime, say which regime and what breaks it.",
  },
  {
    id: "simons",
    name: "Jim Simons",
    school: "Quantitative, Statistical Edge",
    coreBelief:
      "There is no secret chart. Prices contain weak, measurable signals that recur far more often than chance, and the edge comes from many small statistical advantages plus strict risk control — not from prediction.",
    lens: "Data quality, sample size, and whether a signal's edge survives out of sample.",
    rules: [
      { rule: "Trust measured evidence over narrative; require the signal to hold on unseen data.", failsWhen: "A thesis is defended with a story instead of a tested statistic." },
      { rule: "Keep many small positions so no single idea dominates risk.", failsWhen: "One or two positions carry the whole account." },
      { rule: "Cut a strategy when its edge decays instead of waiting for it to come back.", failsWhen: "A broken rule set is kept alive out of loyalty." },
    ],
    appliesTo: ["quant", "trend"],
    tieBreaker: "If the sample is too small or was fit to the data, say the edge is unproven.",
  },
  {
    id: "druckenmiller",
    name: "Stanley Druckenmiller",
    school: "Concentrated Conviction, Risk Management",
    coreBelief:
      "Be right a few times for enormous gains and wrong rarely for small losses. Size comes from conviction, and the first job of any position is to define and obey the exit.",
    lens: "Where the asymmetry is, and how quickly the position proves wrong.",
    rules: [
      { rule: "Size the position by conviction, but never past the point where one trade can end the account.", failsWhen: "Size is increased without a corresponding rise in edge." },
      { rule: "Exit immediately when the premise is invalidated; do not average down.", failsWhen: "A losing thesis is extended with hope." },
      { rule: "Stay liquid and flexible enough to act on the next opportunity.", failsWhen: "All capital is committed and no reserve remains." },
    ],
    appliesTo: ["trend", "swing"],
    tieBreaker: "When upside is unclear but the downside is not, the trade is a no.",
  },
  {
    id: "oneil",
    name: "William O'Neil",
    school: "CAN SLIM, Momentum Growth",
    coreBelief:
      "Big moves start in the stocks with genuine earnings growth and strong institutional sponsorship, and they are bought on confirmed strength rather than on hope or on dips.",
    lens: "Relative strength versus the market, volume on the advance, and whether earnings support the move.",
    rules: [
      { rule: "Trade leaders, not laggards — rank the asset against everything else first.", failsWhen: "A weak relative performer is bought on a dip alone." },
      { rule: "Require above-average volume confirming the advance.", failsWhen: "A price move is taken on thin volume with no sponsorship." },
      { rule: "Cut fast when the move fails; a broken leader is a loss, not a story.", failsWhen: "A failed breakout is held in the hope of recovery." },
    ],
    appliesTo: ["growth", "swing"],
    tieBreaker: "If the asset is not making new highs with volume, there is no setup.",
  },
];