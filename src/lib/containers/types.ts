export type PdfWord = {
  page: number;
  x: number;
  y: number;
  /** OCR only: the word box's height, so `y + height` is its top edge. */
  height?: number;
  text: string;
};

export type PdfPageText = {
  page: number;
  words: PdfWord[];
  /** True when the page had no embedded text layer and was read by OCR. */
  ocr: boolean;
  /** Every OCR reading of the page, when the supplier asks for several. */
  passes?: PdfWord[][];
};

/** One parsed packing-list line, before pallet numbering is applied. */
export type ParsedLine = {
  /** Case / pallet number exactly as printed on the packing list. */
  pallet: string;
  cat: string | null;
  item: string | null;
  /** The supplier's own item code, where its packing list has one. */
  code: string | null;
  diamValue: number | null;
  lengthValue: number | null;
  diamDisplay: string;
  lengthDisplay: string;
  /** Overrides the default `diam X length` rendering when set (square washers). */
  sizeOverride: string | null;
  qty: number | null;
  po: string;
  description: string;
  rawSize: string;
  /** Human-readable reasons this line needs a human to look at it. */
  review: string[];
};

/** A finished CSV row, with pallet numbering and MIX suffixes applied. */
export type ContainerRow = ParsedLine & {
  /** Zero-padded case number plus a `(MIX-n)` suffix where the pallet is mixed. */
  pal: string;
  location: string;
  size: string;
};

export type OcrPass = { scale: number; threshold: number };

export type SupplierRules = {
  id: string;
  label: string;
  /** Set false for suppliers whose rules have not been written yet. */
  ready: boolean;
  /** A short description of what the parser keys off, shown on the rules page. */
  notes: string[];
  /**
   * For scans that read badly at the default settings: OCR the page once per
   * entry, rendered at that scale and turned to pure black and white at that
   * grey level (0-255, or 0 to leave it as rendered). The parser gets every
   * reading in `passes`.
   */
  ocr?: OcrPass[];
  parse: (pages: PdfPageText[]) => ParsedLine[];
};
