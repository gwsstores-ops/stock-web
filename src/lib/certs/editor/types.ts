/**
 * Cert editor - shared types.
 *
 * A supplier's rules are a list of steps applied over the original cert: white
 * boxes that hide the manufacturer's own branding, and stamps that put the GWS
 * branding and wording in its place. The original PDF is kept underneath, so
 * the test values stay exactly as the manufacturer issued them.
 */

/** The overlay images, kept in /public/cert-assets. */
export type AssetId = "gwsLogo" | "gwsAddress" | "gwsStatement";

export const ASSETS: Record<AssetId, string> = {
  gwsLogo: "/cert-assets/gws-logo.png",
  gwsAddress: "/cert-assets/gws-address.png",
  gwsStatement: "/cert-assets/gws-reproduced-statement.png"
};

/**
 * A rectangle in PDF points.
 *
 * `x` is measured from the left edge of the page. `y` is measured from whichever
 * edge `from` names, to the nearest side of the box - so a header box anchored
 * to the top and a footer box anchored to the bottom both stay put on a page
 * that is a different height to the one the rules were measured on.
 */
export type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
  from: "top" | "bottom";
};

/** Hides part of the original with a white box. */
export type CoverStep = {
  kind: "cover";
  box: Box;
  /** What this box hides, shown in the tool and in the run report. */
  note: string;
};

/** Draws one of the GWS images over the original. */
export type StampStep = {
  kind: "stamp";
  asset: AssetId;
  box: Box;
  /**
   * Degrees anticlockwise about the bottom-left corner of the box. Only there
   * to reproduce a stamp that sits slightly off square on the hand-edited
   * sample - leave it out for anything that should be straight.
   */
  rotate?: number;
  note: string;
};

export type EditStep = CoverStep | StampStep;

/** Which pages a supplier's steps are applied to. */
export type PageScope = "all" | "first" | "last";

export type CertRules = {
  id: string;
  label: string;
  /** Set false for suppliers whose rules have not been written yet. */
  ready: boolean;
  /**
   * The page size the boxes were measured against, in points. Pages of another
   * size are scaled by width, keeping each box on the edge it is anchored to.
   */
  reference: { width: number; height: number };
  /**
   * Wording that should appear in the original. Used only to warn when the
   * wrong supplier has been picked - it never blocks the edit.
   */
  fingerprint: string[];
  /** A short description of what the rules do, shown on the page. */
  notes: string[];
  scope: PageScope;
  steps: EditStep[];
};
