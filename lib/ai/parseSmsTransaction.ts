/**
 * Regex parser for bank / UPI transaction SMS → structured fields.
 * Tier 1 of the hybrid pipeline (on-device, no network). Unknown formats
 * fall back to the LLM parser server-side; see lib/actions/sms.ts.
 */

export type TxnDirection = "debit" | "credit";

export interface ParsedTxn {
  amount: number | null;
  currency: string | null;
  /** Raw payee/merchant string as extracted from the SMS. */
  merchant: string | null;
  direction: TxnDirection | null;
  /** ISO date (yyyy-mm-dd) if a date was present in the SMS, else null. */
  occurredAt: string | null;
  /** 0..1 — how confident the regex layer is. Low → caller should LLM-fallback. */
  confidence: number;
  raw: string;
}

const CURRENCY_MAP: Array<[RegExp, string]> = [[/₹|\bRs\.?\b|\bINR\b/i, "INR"]];

// "debited/spent/sent" → the user's account lost money. Checked before credit
// because many debit SMS also say "<payee> credited".
const DEBIT_RE = /\b(debited|debit|spent|sent|paid|withdrawn|purchase)\b/i;
const CREDIT_RE = /\b(credited|credit|received|deposited)\b/i;

function extractCurrency(text: string): string | null {
  for (const [re, code] of CURRENCY_MAP) if (re.test(text)) return code;
  return null;
}

function extractDirection(text: string): TxnDirection | null {
  // "A/C debited ... payee credited" → debit wins (account is the subject).
  if (DEBIT_RE.test(text)) return "debit";
  if (CREDIT_RE.test(text)) return "credit";
  return null;
}

function toNumber(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) || n <= 0 ? null : n;
}

/** Pull the transaction amount — currency-adjacent first, then keyword-adjacent. */
function extractAmount(text: string): number | null {
  // 1. A number right after a currency token: "Rs.1,500.00", "₹250", "INR 99".
  const cur = text.match(/(?:₹|\bRs\.?|\bINR)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (cur) {
    const n = toNumber(cur[1]);
    if (n !== null) return n;
  }
  // 2. A number right after debit/credit: "debited by 199.0", "credited 2000".
  const kw = text.match(
    /(?:debited|credited|debit|credit|spent|sent|paid)\s+(?:by|for|with)?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  );
  if (kw) return toNumber(kw[1]);
  return null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function pad2(s: string): string {
  return s.length === 1 ? "0" + s : s;
}
function year4(y: string): string {
  return y.length === 2 ? "20" + y : y;
}

/** Extract a transaction date in several Indian bank formats → ISO yyyy-mm-dd. */
function extractDate(text: string): string | null {
  // dd-Mon-yy / dd Mon yy / ddMonyy  (02-Jun-26, 02Jun26)
  const mon = text.match(/\b(\d{1,2})[-\s]?([A-Za-z]{3})[-\s]?(\d{2,4})\b/);
  if (mon) {
    const mm = MONTHS[mon[2].toLowerCase()];
    if (mm) return `${year4(mon[3])}-${mm}-${pad2(mon[1])}`;
  }
  // dd-mm-yy / dd/mm/yy / dd.mm.yyyy
  const num = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (num) return `${year4(num[3])}-${pad2(num[2])}-${pad2(num[1])}`;
  return null;
}

const MERCHANT_PATTERNS: RegExp[] = [
  // VPA / UPI handle: "to VPA amazon@ybl", "by VPA john@oksbi" → take name before @
  /(?:to|from|by)\s+VPA\s+([\w.\-]+)@[\w.\-]+/i,
  // bare UPI handle: "to amazon@ybl"
  /(?:to|from)\s+([\w.\-]+)@[\w.\-]+/i,
  // "trf to ZOMATO", "transfer to X", "sent to X", "paid to X"
  /(?:trf to|transfer to|sent to|paid to|to)\s+([A-Za-z0-9][A-Za-z0-9 &._\-]*?)(?=\s+(?:on|ref|refno|ref no|upi|avl|a\/c|info|not|\.|,)|$)/i,
  // ICICI style: "& SWIGGY credited", "and X credited"
  /(?:&|and)\s+([A-Za-z0-9][A-Za-z0-9 &._\-]*?)\s+credited/i,
  // credit: "from JOHN DOE"
  /\bfrom\s+([A-Za-z0-9][A-Za-z0-9 &._\-]*?)(?=\s+(?:on|ref|refno|upi|avl|\.|,)|$)/i,
];

function extractMerchant(text: string): string | null {
  for (const re of MERCHANT_PATTERNS) {
    const m = text.match(re);
    if (m && m[1]) {
      const cleaned = m[1].replace(/\s+/g, " ").replace(/[.,\s]+$/, "").trim();
      if (cleaned && cleaned.toLowerCase() !== "vpa") return cleaned;
    }
  }
  return null;
}

function scoreConfidence(p: {
  amount: number | null;
  direction: TxnDirection | null;
  merchant: string | null;
  currency: string | null;
}): number {
  let c = 0;
  if (p.amount !== null) c += 0.4;
  if (p.direction !== null) c += 0.3;
  if (p.merchant !== null) c += 0.2;
  if (p.currency !== null) c += 0.1;
  return Math.min(1, c);
}

export function parseTransactionSms(raw: string, _sender?: string): ParsedTxn {
  const text = raw.trim();

  const currency = extractCurrency(text);
  const direction = extractDirection(text);
  const amount = extractAmount(text);
  const merchant = extractMerchant(text);
  const occurredAt = extractDate(text);
  const confidence = scoreConfidence({ amount, direction, merchant, currency });

  return { amount, currency, merchant, direction, occurredAt, confidence, raw: text };
}
