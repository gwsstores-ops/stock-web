/** One row of the Containers tab / Admin -> Containers review table. */
export type TrackingRow = {
  container: string;
  supplierRef: string;
  originPort: string;
  originDate: string;
  destPort: string;
  eta: string;
  lastLocation: string;
  lastStatus: string;
  lastStatusDate: string;
};

export const emptyTrackingRow = (): TrackingRow => ({
  container: "",
  supplierRef: "",
  originPort: "",
  originDate: "",
  destPort: "Cork, Ireland",
  eta: "",
  lastLocation: "",
  lastStatus: "",
  lastStatusDate: ""
});
