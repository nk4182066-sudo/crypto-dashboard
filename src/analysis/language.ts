import type { Language, WhatToDoStep } from "./types";

export interface GlossaryTerm {
  term: string;
  english: string;
  urdu: string;
  romanUrdu: string;
}

export const glossary: GlossaryTerm[] = [
  { term: "Bullish", english: "Price is expected to rise.", urdu: "قیمت بڑھنے کا امکان ہے۔", romanUrdu: "Qeemat barhne ka imkaan hai." },
  { term: "Bearish", english: "Price is expected to fall.", urdu: "قیمت گرنے کا امکان ہے۔", romanUrdu: "Qeemat girne ka imkaan hai." },
  { term: "Support", english: "A floor where buyers usually step in.", urdu: "وہ سطح جہاں خریدار عام طور پر آتے ہیں۔", romanUrdu: "Woh satah jahan khareedar aate hain." },
  { term: "Resistance", english: "A ceiling where sellers usually step in.", urdu: "وہ سطح جہاں بیچنے والے عام طور پر آتے ہیں۔", romanUrdu: "Woh satah jahan bechne wale aate hain." },
  { term: "Order Block", english: "A zone where big players left orders, often acting as support or resistance.", urdu: "وہ زون جہاں بڑے کھلاڑیوں کے آرڈر رہتے ہیں۔", romanUrdu: "Woh zone jahan bare khilariyon ke orders hote hain." },
  { term: "Fair Value Gap", english: "A price gap created by a fast move that price often returns to fill.", urdu: "تیز حرکت سے بننے والا خلا جسے قیمت اکثر بھرنے آتی ہے۔", romanUrdu: "Tez harkat se bana khala jise qeemat aksar bharne aati hai." },
  { term: "Liquidity", english: "Clusters of stop losses that price often sweeps before reversing.", urdu: "اسٹاپ لاسز کے جھرمٹ جنہیں قیمت اکثر صاف کرتی ہے۔", romanUrdu: "Stop losses ke jhurmut jinhen qeemat saaf karti hai." },
  { term: "Break of Structure", english: "Price breaking a previous swing high/low, confirming trend direction.", urdu: "پچھلی سوئنگ ٹوٹنے سے رجحان کی تصدیق۔", romanUrdu: "Pichli swing tootne se rujhan ki tasdeeq." },
  { term: "Change of Character", english: "A break that flips the trend from up to down or down to up.", urdu: "وہ بریک جو رجحان پلٹ دے۔", romanUrdu: "Woh break jo rujhan palat de." },
  { term: "ATR", english: "Average True Range — how much price moves on average per candle.", urdu: "اوسط حرکت — ہر کینڈل میں قیمت کتنی ہلتی ہے۔", romanUrdu: "Ausat harkat — har candle mein qeemat kitni hilti hai." },
  { term: "ADX", english: "Measures trend strength above 25 means a strong trend.", urdu: "رجحان کی طاقت ناپتا ہے؛ 25 سے اوپر مضبوط رجحان۔", romanUrdu: "Rujhan ki taqat naapta hai; 25 se ooper mazboot rujhan." },
  { term: "Ichimoku Cloud", english: "A visual trend filter; price above the cloud is bullish.", urdu: "رجحان دکھانے والا بادل؛ بادل کے اوپر قیمت bullish۔", romanUrdu: "Rujhan dikhane wala badal; badal ke ooper qeemat bullish." },
  { term: "VWAP", english: "Volume-weighted average price — the average price real traders paid today.", urdu: "حجم کے حساب سے اوسط قیمت جو حقیقی تاجروں نے ادا کی۔", romanUrdu: "Hajm ke hisab se ausat qeemat jo asli tajiron ne ada ki." },
  { term: "Volume Profile", english: "Shows which prices traded the most volume; the top one is the POC.", urdu: "دکھاتا ہے کس قیمت پر سب سے زیادہ ٹریڈ ہوئی۔", romanUrdu: "Dikhata hai kis qeemat par sab se ziyada trade hui." },
  { term: "Risk / Reward", english: "How much you can win versus how much you can lose on a trade.", urdu: "ایک ٹریڈ میں نفع بمقابلہ نقصان۔", romanUrdu: "Ek trade mein nafa ba muqabla nuqsan." },
  { term: "Stop Loss", english: "The price where you exit to cap your loss.", urdu: "وہ قیمت جہاں نقصان روکنے کے لیے نکل جائیں۔", romanUrdu: "Woh qeemat jahan nuqsan rokne ke liye nikal jayen." },
  { term: "Take Profit", english: "The price where you lock in your gains.", urdu: "وہ قیمت جہاں منافع محفوظ کریں۔", romanUrdu: "Woh qeemat jahan munafa mehfooz karen." },
  { term: "Position Sizing", english: "Choosing how much money to risk so one loss cannot hurt you.", urdu: "کتنا پیسہ لگانا ہے تاکہ ایک نقصان نقصان نہ دے۔", romanUrdu: "Kitna paisa lagana hai taake ek nuqsan harm na kare." },
  { term: "Kelly Criterion", english: "A maths formula for the ideal bet size based on your edge.", urdu: "آپ کے ایج کے مطابق بہترین سائز کی ریاضی۔", romanUrdu: "Aap ke edge ke mutabiq behtareen size ki riyazi." },
  { term: "Risk of Ruin", english: "The chance that a losing streak wipes out your account.", urdu: "امکان کہ مسلسل نقصان اکاؤنٹ ختم کر دے۔", romanUrdu: "Imkaan ke musalsal nuqsan account khatam kar de." },
  { term: "Harmonic Pattern", english: "A structured XABCD reversal pattern such as Gartley or Bat.", urdu: "XABCD ریورسل پیٹرن جیسے گارٹلی یا بیٹ۔", romanUrdu: "XABCD reversal pattern jaise Gartley ya Bat." },
  { term: "Elliott Wave", english: "A 5-wave impulse and 3-wave correction map of market psychology.", urdu: "پانچ لہروں کا رجحان اور تین لہروں کی درستی۔", romanUrdu: "Paanch lehron ka rujhan aur teen lehron ki durusti." },
  { term: "Market Regime", english: "Whether the market is trending or ranging, calm or volatile.", urdu: "بازار رجحان میں ہے یا سائیڈ ویز، پرسکون یا اتار چڑھاؤ۔", romanUrdu: "Bazaar rujhan mein hai ya sideways, pursukoon ya utar charhao." },
];

export function glossaryFor(language: Language) {
  return glossary.map((entry) => ({
    term: entry.term,
    meaning: language === "Urdu" ? entry.urdu : language === "Roman Urdu" ? entry.romanUrdu : entry.english,
  }));
}

export interface WhatToDoContext {
  bias: "Bullish" | "Bearish" | "Sideways";
  direction: "buy" | "sell" | "wait";
  qualityScore: number;
  entryLow: number | null;
  entryHigh: number | null;
  stop: number | null;
  takeProfits: { label: string; price: number }[];
  regimeType: string;
  aligned: boolean;
  riskCash: number | null;
  riskPercent: number;
}

function fmt(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function buildWhatToDo(context: WhatToDoContext): Record<Language, WhatToDoStep[]> {
  const { bias, direction, qualityScore, entryLow, entryHigh, stop, takeProfits, regimeType, aligned, riskCash, riskPercent } = context;
  const directionWord = direction === "buy" ? "long (buy)" : direction === "sell" ? "short (sell)" : "no trade";
  const directionUrdu = direction === "buy" ? "خریداری (لانگ)" : direction === "sell" ? "فروخت (شارٹ)" : "کوئی ٹریڈ نہیں";
  const directionRoman = direction === "buy" ? "khareedari (long)" : direction === "sell" ? "farokht (short)" : "koi trade nahi";
  const entry = entryLow !== null && entryHigh !== null ? `${fmt(entryLow)} - ${fmt(entryHigh)}` : "—";
  const tps = takeProfits.map((tp) => `${tp.label} ${fmt(tp.price)}`).join(", ") || "—";

  const english: WhatToDoStep[] = [
    { step: 1, action: `Overall bias is ${bias.toLowerCase()}`, detail: `The combined structure, trend and volume signals say the market leans ${bias.toLowerCase()}. ${aligned ? "All timeframes agree, which raises confidence." : "Timeframes are not fully aligned, so trade smaller."}` },
    { step: 2, action: `Consider a ${directionWord} trade`, detail: direction === "wait" ? "Do not force a trade. The setup quality is too low right now." : `Setup quality score is ${qualityScore}/100. Only act if it is above 70.` },
    { step: 3, action: `Wait for entry inside ${entry}`, detail: "Do not chase price. Let it come to your zone and show a reaction candle." },
    { step: 4, action: `Place stop loss at ${fmt(stop)}`, detail: `Risk no more than ${riskPercent}% of your account${riskCash !== null ? ` (about $${fmt(riskCash)})` : ""}.` },
    { step: 5, action: `Scale out at ${tps}`, detail: "Take part of the profit at TP1, move the stop to break-even, then trail the rest." },
    { step: 6, action: `Market is ${regimeType.toLowerCase()}`, detail: regimeType === "Trending" ? "Follow the trend and let winners run." : "In a range, buy low and sell high at the edges, and expect smaller targets." },
  ];

  const romanUrdu: WhatToDoStep[] = [
    { step: 1, action: `Rujhan ${bias.toLowerCase()} hai`, detail: `Structure, trend aur volume mil kar batate hain ke market ${bias.toLowerCase()} taraf jhuka hai. ${aligned ? "Tamam timeframes ittefaq rakhte hain." : "Timeframes poore mutabiq nahi, chhota position lein."}` },
    { step: 2, action: `${directionRoman} trade par ghaur karein`, detail: direction === "wait" ? "Trade zabardasti na karein, setup abhi kamzor hai." : `Setup quality ${qualityScore}/100 hai. 70 se ooper ho to hi enter karein.` },
    { step: 3, action: `Entry ka intezar karein ${entry} ke andar`, detail: "Qeemat ke peeche na bhagen, usay apne zone mein aane dein." },
    { step: 4, action: `Stop loss ${fmt(stop)} par rakhein`, detail: `Account ka sirf ${riskPercent}% risk karein${riskCash !== null ? ` (taqreeban $${fmt(riskCash)})` : ""}.` },
    { step: 5, action: `Munafa ${tps} par scale karein`, detail: "TP1 par hissa book karein, stop break-even par le aayen, phir trail karein." },
    { step: 6, action: `Market ${regimeType.toLowerCase()} hai`, detail: regimeType === "Trending" ? "Trend ke sath chalein aur jeetne wale trade chalne dein." : "Range mein neeche khareedein aur ooper bechein." },
  ];

  const urdu: WhatToDoStep[] = [
    { step: 1, action: `رجحان ${bias.toLowerCase()} ہے`, detail: `سٹرکچر، ٹرینڈ اور والیوم بتاتے ہیں کہ بازار ${bias.toLowerCase()} طرف ہے۔ ${aligned ? "تمام ٹائم فریم متفق ہیں۔" : "ٹائم فریم مکمل متفق نہیں، چھوٹا سائز لیں۔"}` },
    { step: 2, action: `${directionUrdu} ٹریڈ پر غور کریں`, detail: direction === "wait" ? "زبردستی ٹریڈ نہ کریں، سیٹ اپ ابھی کمزور ہے۔" : `سیٹ اپ کوالٹی ${qualityScore}/100 ہے، 70 سے اوپر ہو تو داخل ہوں۔` },
    { step: 3, action: `داخلہ ${entry} کے اندر کا انتظار کریں`, detail: "قیمت کے پیچھے نہ بھاگیں، اسے اپنے زون میں آنے دیں۔" },
    { step: 4, action: `اسٹاپ لاس ${fmt(stop)} پر رکھیں`, detail: `اکاؤنٹ کا صرف ${riskPercent}% رسک کریں${riskCash !== null ? ` (تقریباً $${fmt(riskCash)})` : ""}۔` },
    { step: 5, action: `منافع ${tps} پر حاصل کریں`, detail: "TP1 پر حصہ بک کریں، اسٹاپ بریک ایون پر لائیں، پھر ٹریل کریں۔" },
    { step: 6, action: `بازار ${regimeType.toLowerCase()} ہے`, detail: regimeType === "Trending" ? "رجحان کے ساتھ چلیں اور جیتنے والا ٹریڈ چلنے دیں۔" : "رینج میں نیچے خریدیں اور اوپر بیچیں۔" },
  ];

  return { English: english, Urdu: urdu, "Roman Urdu": romanUrdu };
}

