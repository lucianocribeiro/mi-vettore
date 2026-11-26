/** Formato dinero es-AR: miles con `.`, decimales con `,`. */

export function parseMoneyEs(raw: string): number | null {
  let s = String(raw ?? "").trim();
  if (!s || s === "-" || s === "," || s === ".") return null;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1).trim();
  s = s.replace(/\s/g, "");

  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, "");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export function formatMoneyEs(
  n: number | null | undefined,
  maxFrac = 2
): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toLocaleString("es-AR", {
    maximumFractionDigits: maxFrac,
    minimumFractionDigits: 0,
  });
}

/** Reformatea mientras el usuario tipea (separador de miles). */
export function formatMoneyTyping(
  raw: string,
  opts?: { allowNegative?: boolean; maxDecimals?: number }
): string {
  const allowNegative = opts?.allowNegative ?? false;
  const maxDecimals = opts?.maxDecimals ?? 2;
  const neg = allowNegative && /^\s*-/.test(raw);
  let s = String(raw).replace(/[^\d.,]/g, "");

  let intPart = "";
  let decPart: string | null = null;
  let trailingComma = false;

  if (s.includes(",")) {
    const i = s.lastIndexOf(",");
    intPart = s.slice(0, i).replace(/\D/g, "");
    const rest = s.slice(i + 1).replace(/\D/g, "");
    trailingComma = rest.length === 0 && s.endsWith(",");
    decPart = rest.slice(0, maxDecimals);
  } else if (s.includes(".")) {
    const parts = s.split(".");
    const allDigits = s.replace(/\D/g, "");
    const last = parts[parts.length - 1] || "";
    const looksDecimal =
      parts.length === 2 &&
      last.length > 0 &&
      last.length <= maxDecimals &&
      (parts[0] || "").replace(/\D/g, "").length <= 3 &&
      !/^\d{1,3}(\.\d{3})+$/.test(s);
    if (looksDecimal) {
      intPart = (parts[0] || "").replace(/\D/g, "");
      decPart = last.replace(/\D/g, "").slice(0, maxDecimals);
    } else {
      intPart = allDigits;
    }
  } else {
    intPart = s.replace(/\D/g, "");
  }

  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  let out = withSep;
  if (decPart != null) out += `,${decPart}`;
  else if (trailingComma) out += ",";
  if (neg && (out || trailingComma)) out = `-${out}`;
  return out;
}
