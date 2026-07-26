import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type StockRow = {
  id: number;
  location: string;
  area: string;
  item: string;
  size: string;
  qty: number | null;
};

type ParsedSize = {
  diam: string;
  length: string;
  matchedText: string;
};

const allowedAreas = ["GWS", "W3", "W4"];
const pageSize = 1000;
const maximumRows = 5000;
const itemCacheDuration = 5 * 60 * 1000;

let itemCache:
  | {
      expiresAt: number;
      items: string[];
    }
  | undefined;

const stopWords = new Set([
  "A",
  "AN",
  "AND",
  "ANY",
  "ARE",
  "AT",
  "AVAILABLE",
  "CAN",
  "DO",
  "FIND",
  "FOR",
  "HAS",
  "HAVE",
  "I",
  "IN",
  "IS",
  "LEFT",
  "LOCATION",
  "LOCATIONS",
  "ME",
  "MY",
  "OF",
  "ON",
  "PLEASE",
  "QTY",
  "QUANTITY",
  "SHOW",
  "SIZE",
  "SOME",
  "STOCK",
  "THE",
  "THERE",
  "TO",
  "WANT",
  "WE",
  "WHAT",
  "WHERE",
  "WHICH",
  "WITH"
]);

function extractArea(question: string) {
  return allowedAreas.find((area) =>
    new RegExp(`\\b${area}\\b`, "i").test(question)
  );
}

function extractSize(question: string): ParsedSize | null {
  const number =
    String.raw`(?:\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)`;
  const pattern = new RegExp(
    String.raw`\bM?(${number})\s*(?:X|BY|×|\*)\s*(${number})\b`,
    "i"
  );
  const match = question.match(pattern);

  if (!match) return null;

  return {
    diam: match[1].replace(/\s+/g, " ").trim(),
    length: match[2].replace(/\s+/g, " ").trim(),
    matchedText: match[0]
  };
}

function normalizeStockWords(value: string) {
  return value
    .toUpperCase()
    .replace(
      /\bHOT\s+DIP\s+GALV(?:ANI[ZS]ED)?\b|\bHOT\s+DIP\s+GALVANI[ZS]ED\b/g,
      " HDG "
    )
    .replace(/\bELECTRO\s+ZINC(?:\s+PLATED)?\b/g, " ZP ")
    .replace(/\bZINC\s+PLATED\b/g, " ZP ")
    .replace(/\bZINC\b/g, " ZP ")
    .replace(/\bGALV(?:ANI[ZS]ED)?\b/g, " HDG ")
    .replace(/\bASSEMBLED\b/g, " ASS ")
    .replace(/\bSTAINLESS\s+STEEL\b/g, " SS ")
    .replace(/\bU[\s-]*BOLTS?\b/g, " U BOLT ")
    .replace(/\bSQUARE\b/g, " SQ ")
    .replace(/\bHEX\b/g, " ")
    .replace(/\bPLATES?\b/g, " ")
    .replace(/\bSETS\b/g, " SET ")
    .replace(/\bBOLTS\b/g, " BOLT ")
    .replace(/\bNUTS\b/g, " NUT ")
    .replace(/\bWASHERS\b/g, " WASHER ")
    .replace(/\bSCREWS\b/g, " SCREW ")
    .replace(/[^A-Z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getQuestionTokens(question: string, size: ParsedSize | null) {
  const withoutSize = size
    ? question.replace(size.matchedText, " ")
    : question;

  return [
    ...new Set(
      normalizeStockWords(withoutSize)
        .split(" ")
        .filter(Boolean)
        .filter((token) => !stopWords.has(token))
        .filter((token) => !allowedAreas.includes(token))
        .filter((token) => !/^\d/.test(token))
    )
  ];
}

function itemTokens(item: string) {
  return normalizeStockWords(item).split(" ").filter(Boolean);
}

async function loadItemNames() {
  if (itemCache && itemCache.expiresAt > Date.now()) {
    return itemCache.items;
  }

  const items: string[] = [];

  for (let start = 0; start < maximumRows; start += pageSize) {
    const { data, error } = await supabase
      .from("stock")
      .select("item")
      .in("area", allowedAreas)
      .not("item", "is", null)
      .order("item", { ascending: true })
      .range(start, start + pageSize - 1);

    if (error) throw error;

    const page = data ?? [];
    items.push(
      ...page
        .map((row) => row.item)
        .filter((item): item is string => Boolean(item))
    );

    if (page.length < pageSize) break;
  }

  const uniqueItems = [...new Set(items)];
  itemCache = {
    items: uniqueItems,
    expiresAt: Date.now() + itemCacheDuration
  };

  return uniqueItems;
}

async function loadStockRows(
  item: string,
  area: string | undefined,
  size: ParsedSize | null
) {
  const rows: StockRow[] = [];

  for (let start = 0; start < maximumRows; start += pageSize) {
    let query = supabase
      .from("stock")
      .select("id, location, area, item, size, qty")
      .eq("item", item);

    query = area
      ? query.eq("area", area)
      : query.in("area", allowedAreas);

    if (size) {
      query = query
        .eq("diam_display", size.diam)
        .eq("length_display", size.length);
    }

    const { data, error } = await query
      .order("location", { ascending: true })
      .range(start, start + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as StockRow[];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question =
      typeof body.question === "string" ? body.question.trim() : "";

    if (!question) {
      return NextResponse.json(
        { error: "Please enter a stock question" },
        { status: 400 }
      );
    }

    const area = extractArea(question);
    const size = extractSize(question);
    const questionTokens = getQuestionTokens(question, size);

    if (questionTokens.length === 0) {
      return NextResponse.json({
        rows: [],
        clarification: "Please include an item in the question"
      });
    }

    const uniqueItems = await loadItemNames();
    let matchedItems = uniqueItems.filter((item) => {
      const tokens = new Set(itemTokens(item));
      return questionTokens.every((token) => tokens.has(token));
    });

    const normalizedQuestionItem = questionTokens.join(" ");
    const exactItem = matchedItems.find(
      (item) => normalizeStockWords(item) === normalizedQuestionItem
    );

    if (exactItem) {
      matchedItems = [exactItem];
    }

    if (matchedItems.length === 0) {
      return NextResponse.json({
        rows: [],
        clarification: "Item not recognised. Try using the item code"
      });
    }

    if (matchedItems.length > 1) {
      return NextResponse.json({
        rows: [],
        clarification: `Please be more specific: ${matchedItems
          .slice(0, 4)
          .join(" or ")}`
      });
    }

    const rows = await loadStockRows(matchedItems[0], area, size);

    return NextResponse.json({
      rows,
      answer: rows.length > 0 ? "IN STOCK" : "NOT IN STOCK"
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stock search failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
