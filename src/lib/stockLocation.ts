export const splitStockLocation = (value: string) => {
  const [location, palletId = ""] = value.split(/\s*↕️?→{3}\s*/u, 2);

  return {
    location: location.trim(),
    palletId: palletId.trim()
  };
};
