// The print agent on the stores PC sends `Authorization: Bearer ${PRINT_AGENT_KEY}`.
// The same key is in its local config file (see print-agent/README.md).
export function isPrintAgent(req: Request): boolean {
  const key = process.env.PRINT_AGENT_KEY;
  return !!key && req.headers.get("authorization") === `Bearer ${key}`;
}
