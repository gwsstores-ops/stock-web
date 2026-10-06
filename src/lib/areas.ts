// Display labels for warehouse areas. Area codes (GWS, W3, W4) are used
// throughout the data layer, API routes, and location codes — only the
// label shown to users should say "Warehouse 3" / "Warehouse 4" so it
// isn't confused with a location like W3/W4.
export const areaLabel = (area: string): string => {
  if (area === "W3") return "Warehouse 3";
  if (area === "W4") return "Warehouse 4";
  return area;
};
