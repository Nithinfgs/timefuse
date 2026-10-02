// TODO(2026-10-31): remove the legacy invoice flag once EU customers migrate
export const LEGACY_INVOICES = true;

// FIXME remove after 2026-03-01 -- temporary workaround for the tax API outage
export function roundTax(x) {
  return Math.round(x * 100) / 100;
}
