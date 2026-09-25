import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import {
  TIPO_TALLER_CHIP,
  TIPO_TALLER_LABEL,
  canWriteMaster,
  type TallerProveedor,
  type TipoTaller,
} from "../../types";

type MetodoPagoLinea = "TRANSFERENCIA" | "CHEQUE" | "EFECTIVO";

type PagoLinea = {
  key: string;
  metodo: MetodoPagoLinea;
  monto: string;
  detalle: string;
};

type MetodoPago = "TRANSFERENCIA" | "CHEQUE" | "EFECTIVO" | "MIXTO";

type Saldo = {
  id: string;
  razonSocial: string;
  cuit: string;
  aliasCbu: string | null;
  pendiente: number;
  pagado: number;
  movimientos: {
    id: string;
    montoFacturado: number;
    fechaFactura: string;
    fechaPago: string | null;
    estado: "PENDIENTE" | "PAGADO";
    otId: string | null;
    ot?: { numeroOT: string; solicitud?: { camioneta?: { patente: string } } } | null;
    metodoPago?: string | null;
  }[];
};

function money(n: number) {
  return `$${n.toLocaleString("es-AR")}`;
}

function nuevaPagoLinea(
  parcial?: Partial<PagoLinea>
): PagoLinea {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metodo: "TRANSFERENCIA",
    monto: "",
    detalle: "",
    ...parcial,
  };
}

function parseMontoLinea(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function whatsappDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = `54${digits.slice(1)}`;
  if (digits.length < 8) return null;
  return digits;
}

function TipoChip({
  tipo,
  selected,
  onClick,
}: {
  tipo: TipoTaller;
  selected?: boolean;
  onClick?: () => void;
}) {
  const base = TIPO_TALLER_CHIP[tipo] ?? "border-[var(--vl-card-border)]";
  const inactive = "border-[var(--vl-card-border)] bg-transparent text-[var(--vl-text-muted)] opacity-70";
  const cls = onClick
    ? selected
      ? `${base} ring-1 ring-offset-1 ring-slate-400 dark:ring-offset-[var(--vl-card)]`
      : inactive
    : base;
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {TIPO_TALLER_LABEL[tipo] ?? tipo}
    </Tag>
  );
}

export function TalleresProveedoresPanel({
  vista,
}: {
  /** Si se pasa, fija la vista y oculta el submenú interno (tabs al nivel de Órdenes). */
  vista?: "abm" | "cc";
} = {}) {
  const { token, user } = useAuth();
  const canEdit = canWriteMaster(user?.rol);
  const [tabInternal, setTabInternal] = useState<"abm" | "cc">("abm");
  const tab = vista ?? tabInternal;
  const setTab = setTabInternal;
  const [ccVista, setCcVista] = useState<"pendiente" | "pagado">("pendiente");
  const [items, setItems] = useState<TallerProveedor[]>([]);
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [tipos, setTipos] = useState<TipoTaller[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TallerProveedor | null>(null);
  const [creating, setCreating] = useState(false);
  const [cuit, setCuit] = useState("");
  const [razon, setRazon] = useState("");
  const [direccion, setDireccion] = useState("");
  const [mail, setMail] = useState("");
  const [celular, setCelular] = useState("");
  const [whatsapp, setWhatsapp] = useState(false);
  const [alias, setAlias] = useState("");
  const [selTipos, setSelTipos] = useState<TipoTaller[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<"" | TipoTaller>("");
  const [busqueda, setBusqueda] = useState("");
  const [contactoTaller, setContactoTaller] = useState<TallerProveedor | null>(null);
  /** Selección multi por proveedor (solo PENDIENTE). */
  const [selMovs, setSelMovs] = useState<Record<string, string[]>>({});
  const [pagoModal, setPagoModal] = useState<{
    tallerId: string;
    movIds: string[];
    totalAdeudado: number;
  } | null>(null);
  const [pagoFecha, setPagoFecha] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [pagoLineas, setPagoLineas] = useState<PagoLinea[]>(() => [
    nuevaPagoLinea(),
  ]);
  const [pagoObs, setPagoObs] = useState("");
  const [pagoSaving, setPagoSaving] = useState(false);
  const [pagoError, setPagoError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [list, meta, cc] = await Promise.all([
        apiFetch<TallerProveedor[]>("/api/talleres-proveedores", {}, token),
        apiFetch<{ tipos: TipoTaller[] }>("/api/talleres-proveedores/meta", {}, token),
        apiFetch<Saldo[]>("/api/talleres-proveedores/saldos", {}, token).catch(() => []),
      ]);
      setItems(list);
      setTipos(meta.tipos ?? (Object.keys(TIPO_TALLER_LABEL) as TipoTaller[]));
      setSaldos(cc);
      setSelMovs({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (vista) setTabInternal(vista);
  }, [vista]);

  function openForm(t?: TallerProveedor) {
    setEditing(t ?? null);
    setCreating(!t);
    setCuit(t?.cuit ?? "");
    setRazon(t?.razonSocial ?? "");
    setDireccion(t?.direccion ?? "");
    setMail(t?.mail ?? "");
    setCelular(t?.celular ?? "");
    setWhatsapp(!!t?.whatsapp);
    setAlias(t?.aliasCbu ?? "");
    setSelTipos((t?.tipos ?? []).map((x) => x.tipo));
  }

  async function save() {
    if (!token) return;
    const body = {
      cuit,
      razonSocial: razon,
      direccion,
      mail,
      celular,
      whatsapp,
      aliasCbu: alias,
      tipos: selTipos,
    };
    try {
      if (editing) {
        await apiFetch(`/api/talleres-proveedores/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        }, token);
      } else {
        await apiFetch("/api/talleres-proveedores", {
          method: "POST",
          body: JSON.stringify(body),
        }, token);
      }
      setCreating(false);
      setEditing(null);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  }

  function resetPagoForm() {
    setPagoFecha(new Date().toISOString().slice(0, 10));
    setPagoLineas([nuevaPagoLinea()]);
    setPagoObs("");
    setPagoError(null);
  }

  function openPago(tallerId: string, movIds: string[]) {
    if (!movIds.length) return;
    const taller = saldos.find((s) => s.id === tallerId);
    const totalAdeudado = roundMoney(
      (taller?.movimientos ?? [])
        .filter((m) => movIds.includes(m.id))
        .reduce((a, m) => a + m.montoFacturado, 0)
    );
    setPagoModal({ tallerId, movIds, totalAdeudado });
    resetPagoForm();
  }

  function montoObjetivoPago(): number {
    if (!pagoModal) return 0;
    return roundMoney(pagoModal.totalAdeudado);
  }

  function sumLineas(lineas: PagoLinea[] = pagoLineas): number {
    return roundMoney(lineas.reduce((a, l) => a + parseMontoLinea(l.monto), 0));
  }

  /** Si un método no cubre el total de ítems, agrega otro con el resto. */
  function syncPagoLineas(next: PagoLinea[], objetivo: number) {
    let lines = next.length ? [...next] : [nuevaPagoLinea()];

    while (
      lines.length > 1 &&
      parseMontoLinea(lines[lines.length - 1].monto) <= 0 &&
      !lines[lines.length - 1].detalle.trim()
    ) {
      lines.pop();
    }

    let sum = sumLineas(lines);
    let falta = roundMoney(objetivo - sum);

    if (falta < -0.009 && lines.length >= 2) {
      const withoutLast = lines.slice(0, -1);
      const sumPrev = sumLineas(withoutLast);
      const resto = roundMoney(objetivo - sumPrev);
      if (resto > 0.009) {
        lines = [
          ...withoutLast,
          { ...lines[lines.length - 1], monto: String(resto) },
        ];
      } else {
        lines = withoutLast;
      }
      sum = sumLineas(lines);
      falta = roundMoney(objetivo - sum);
    }

    if (falta > 0.009) {
      const last = lines[lines.length - 1];
      const lastMonto = parseMontoLinea(last.monto);
      if (lastMonto > 0 || last.detalle.trim()) {
        lines.push(nuevaPagoLinea({ monto: String(falta) }));
      } else if (lines.length > 1) {
        lines[lines.length - 1] = { ...last, monto: String(falta) };
      }
    }

    setPagoLineas(lines.length ? lines : [nuevaPagoLinea()]);
  }

  function updatePagoLinea(key: string, patch: Partial<PagoLinea>) {
    const objetivo = montoObjetivoPago();
    const next = pagoLineas.map((l) =>
      l.key === key ? { ...l, ...patch } : l
    );
    syncPagoLineas(next, objetivo);
  }

  function toggleMov(tallerId: string, movId: string) {
    setSelMovs((prev) => {
      const cur = prev[tallerId] ?? [];
      const next = cur.includes(movId)
        ? cur.filter((id) => id !== movId)
        : [...cur, movId];
      return { ...prev, [tallerId]: next };
    });
  }

  function toggleAllPendientes(tallerId: string, ids: string[]) {
    setSelMovs((prev) => {
      const cur = prev[tallerId] ?? [];
      const allOn = ids.length > 0 && ids.every((id) => cur.includes(id));
      return { ...prev, [tallerId]: allOn ? [] : [...ids] };
    });
  }

  function buildPagoBody() {
    const objetivo = montoObjetivoPago();
    let montoTransferencia = 0;
    let montoCheque = 0;
    let montoEfectivo = 0;
    const detTransf: string[] = [];
    const detCheque: string[] = [];
    const detEfec: string[] = [];

    for (const l of pagoLineas) {
      const m = parseMontoLinea(l.monto);
      if (m <= 0) continue;
      if (l.metodo === "TRANSFERENCIA") {
        montoTransferencia = roundMoney(montoTransferencia + m);
        if (l.detalle.trim()) detTransf.push(l.detalle.trim());
      } else if (l.metodo === "CHEQUE") {
        montoCheque = roundMoney(montoCheque + m);
        if (l.detalle.trim()) detCheque.push(l.detalle.trim());
      } else {
        montoEfectivo = roundMoney(montoEfectivo + m);
        if (l.detalle.trim()) detEfec.push(l.detalle.trim());
      }
    }

    const usaT = montoTransferencia > 0;
    const usaC = montoCheque > 0;
    const usaE = montoEfectivo > 0;
    let metodoPago: MetodoPago = "TRANSFERENCIA";
    if ((usaT && usaC) || (usaT && usaE) || (usaC && usaE)) {
      metodoPago = "MIXTO";
    } else if (usaC) metodoPago = "CHEQUE";
    else if (usaE) metodoPago = "EFECTIVO";
    else if (usaT) metodoPago = "TRANSFERENCIA";
    else metodoPago = pagoLineas[0]?.metodo ?? "TRANSFERENCIA";

    const obsParts: string[] = [];
    if (pagoObs.trim()) obsParts.push(pagoObs.trim());
    if (usaE && (usaT || usaC)) {
      obsParts.push(`Efectivo: $${montoEfectivo.toLocaleString("es-AR")}`);
    }
    if (detEfec.length && (usaT || usaC)) {
      obsParts.push(`Detalle efectivo: ${detEfec.join(" · ")}`);
    }

    const body: Record<string, unknown> = {
      fechaPago: pagoFecha,
      metodoPago,
      montoPagado: objetivo,
    };
    if (obsParts.length) body.observacionPago = obsParts.join(" · ");
    if (usaT) {
      body.montoTransferencia = montoTransferencia;
      if (detTransf.length) body.detalleTransferencia = detTransf.join(" · ");
    }
    if (usaC) {
      body.montoCheque = montoCheque;
      if (detCheque.length) body.detalleCheque = detCheque.join(" · ");
    }
    if (usaE && !usaT && !usaC && detEfec.length) {
      body.observacionPago = [pagoObs.trim(), detEfec.join(" · ")]
        .filter(Boolean)
        .join(" · ");
    }
    return body;
  }

  async function confirmarPago() {
    if (!token || !pagoModal) return;
    if (!pagoFecha) {
      setPagoError("La fecha es obligatoria");
      return;
    }
    const objetivo = montoObjetivoPago();
    if (objetivo <= 0) {
      setPagoError("No hay monto a pagar");
      return;
    }
    const sumaMetodos = sumLineas();
    const hayMontosMetodo = pagoLineas.some((l) => parseMontoLinea(l.monto) > 0);
    if (!hayMontosMetodo) {
      setPagoError("Indicá al menos un monto en un método de pago");
      return;
    }
    if (Math.abs(sumaMetodos - objetivo) > 0.009) {
      setPagoError(
        `La suma de métodos (${money(sumaMetodos)}) debe ser igual al total de ítems (${money(objetivo)})`
      );
      return;
    }
    setPagoSaving(true);
    setPagoError(null);
    try {
      const body = buildPagoBody();
      if (pagoModal.movIds.length === 1) {
        await apiFetch(
          `/api/talleres-proveedores/${pagoModal.tallerId}/movimientos/${pagoModal.movIds[0]}/pagar`,
          { method: "POST", body: JSON.stringify(body) },
          token
        );
      } else {
        await apiFetch(
          `/api/talleres-proveedores/${pagoModal.tallerId}/movimientos/pagar-lote`,
          {
            method: "POST",
            body: JSON.stringify({ ...body, movimientoIds: pagoModal.movIds }),
          },
          token
        );
      }
      setPagoModal(null);
      await load();
    } catch (err) {
      setPagoError(err instanceof ApiError ? err.message : "No se pudo registrar el pago");
    } finally {
      setPagoSaving(false);
    }
  }

  async function revertirPago(tallerId: string, movId: string) {
    if (!token) return;
    await apiFetch(
      `/api/talleres-proveedores/${tallerId}/movimientos/${movId}/revertir-pago`,
      { method: "POST", body: "{}" },
      token
    );
    await load();
  }

  const input =
    "mt-1 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm";

  const tiposLista = tipos.length
    ? tipos
    : (Object.keys(TIPO_TALLER_LABEL) as TipoTaller[]);

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items.filter((t) => {
      if (filtroTipo && !(t.tipos ?? []).some((x) => x.tipo === filtroTipo)) {
        return false;
      }
      if (!q) return true;
      const hay = [
        t.cuit,
        t.razonSocial,
        t.aliasCbu ?? "",
        t.mail ?? "",
        t.celular ?? "",
        ...(t.tipos ?? []).map((x) => TIPO_TALLER_LABEL[x.tipo] ?? x.tipo),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, filtroTipo, busqueda]);

  const pagoObjetivo = pagoModal ? montoObjetivoPago() : 0;
  const pagoSumaMetodos = sumLineas();
  const pagoFalta = roundMoney(pagoObjetivo - pagoSumaMetodos);

  return (
    <div>
      {!vista && (
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("abm")}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            tab === "abm"
              ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
              : "border-[var(--vl-card-border)]"
          }`}
        >
          Proveedores
        </button>
        <button
          type="button"
          onClick={() => setTab("cc")}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            tab === "cc"
              ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
              : "border-[var(--vl-card-border)]"
          }`}
        >
          Cuenta corriente
        </button>
      </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {tab === "abm" && (
        <>
          {canEdit && (
            <button
              type="button"
              onClick={() => openForm()}
              className="mb-3 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900"
            >
              Nuevo taller
            </button>
          )}
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="min-w-[12rem] flex-1 text-xs text-[var(--vl-text-muted)]">
              Buscar
              <input
                className={input}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="CUIT, razón social, alias…"
              />
            </label>
            <label className="text-xs text-[var(--vl-text-muted)]">
              Tipo de taller
              <select
                className={`${input} mt-1 min-w-[12rem]`}
                value={filtroTipo}
                onChange={(e) =>
                  setFiltroTipo((e.target.value || "") as "" | TipoTaller)
                }
              >
                <option value="">Todos</option>
                {tiposLista.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {TIPO_TALLER_LABEL[tipo] ?? tipo}
                  </option>
                ))}
              </select>
            </label>
            {(filtroTipo || busqueda.trim()) && (
              <p className="pb-2 text-[11px] text-[var(--vl-text-muted)]">
                Mostrando {itemsFiltrados.length} de {items.length}
              </p>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--vl-card-border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--vl-page)] text-xs text-[var(--vl-text-muted)]">
                <tr>
                  <th className="px-3 py-2">CUIT</th>
                  <th className="px-3 py-2">Razón social</th>
                  <th className="px-3 py-2">Tipos</th>
                  <th className="px-3 py-2">Alias/CBU</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {itemsFiltrados.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-t border-[var(--vl-card-border)] hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    onClick={() => setContactoTaller(t)}
                  >
                    <td className="px-3 py-2">{t.cuit}</td>
                    <td className="px-3 py-2">{t.razonSocial}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(t.tipos ?? []).length
                          ? (t.tipos ?? []).map((x) => (
                              <TipoChip key={x.tipo} tipo={x.tipo} />
                            ))
                          : "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">{t.aliasCbu ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="mr-2 text-xs underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContactoTaller(t);
                        }}
                      >
                        Contacto
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openForm(t);
                          }}
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "cc" && (
        <div className="space-y-3">
          {(() => {
            const nPend = saldos.filter((s) => s.pendiente > 0).length;
            const nPag = saldos.filter((s) => s.pagado > 0).length;
            return (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCcVista("pendiente")}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                ccVista === "pendiente"
                  ? "border-amber-600 bg-amber-500/20 text-amber-900 dark:border-amber-400 dark:text-amber-100"
                  : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
              }`}
            >
              Pendientes{nPend ? ` (${nPend})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setCcVista("pagado")}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                ccVista === "pagado"
                  ? "border-emerald-600 bg-emerald-500/20 text-emerald-900 dark:border-emerald-400 dark:text-emerald-100"
                  : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
              }`}
            >
              Pagados / historial{nPag ? ` (${nPag})` : ""}
            </button>
          </div>
            );
          })()}
          <p className="text-[11px] text-[var(--vl-text-muted)]">
            {ccVista === "pendiente"
              ? "Marcá varios ítems del mismo proveedor y usá “Pagar seleccionados”, o pagá de a uno."
              : "Historial de pagos. Podés revertir un cobro si se cargó mal."}
          </p>
          {saldos
            .filter((s) => (ccVista === "pendiente" ? s.pendiente > 0 : s.pagado > 0))
            .map((s) => {
              const pendientes = s.movimientos.filter((m) => m.estado === "PENDIENTE");
              const selected = selMovs[s.id] ?? [];
              const selectedSum = pendientes
                .filter((m) => selected.includes(m.id))
                .reduce((a, m) => a + m.montoFacturado, 0);
              return (
            <div key={s.id} className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-[var(--vl-heading)]">{s.razonSocial}</div>
                  {s.aliasCbu && (
                    <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                      Alias/CBU: {s.aliasCbu}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {ccVista === "pendiente" ? (
                  <>
                  <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
                    Pendiente {money(s.pendiente)}
                  </span>
                  {selected.length > 0 && (
                    <button
                      type="button"
                      className="inline-flex min-h-9 items-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500"
                      onClick={() => openPago(s.id, selected)}
                    >
                      Pagar seleccionados ({selected.length}
                      {selectedSum ? ` · ${money(selectedSum)}` : ""})
                    </button>
                  )}
                  </>
                  ) : (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                    Pagado {money(s.pagado)}
                  </span>
                  )}
                </div>
              </div>
              {ccVista === "pendiente" && pendientes.length > 1 && (
                <label className="mt-2 inline-flex items-center gap-2 text-[11px] text-[var(--vl-text-muted)]">
                  <input
                    type="checkbox"
                    checked={
                      pendientes.length > 0 &&
                      pendientes.every((m) => selected.includes(m.id))
                    }
                    onChange={() =>
                      toggleAllPendientes(
                        s.id,
                        pendientes.map((m) => m.id)
                      )
                    }
                  />
                  Seleccionar todos
                </label>
              )}
              <ul className="mt-3 space-y-2">
                {s.movimientos
                  .filter((m) =>
                    ccVista === "pendiente" ? m.estado === "PENDIENTE" : m.estado === "PAGADO"
                  )
                  .map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-col gap-2 rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      {m.estado === "PENDIENTE" && (
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.includes(m.id)}
                          onChange={() => toggleMov(s.id, m.id)}
                          aria-label="Seleccionar para pago"
                        />
                      )}
                      <div className="min-w-0 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--vl-heading)]">
                            {money(m.montoFacturado)}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              m.estado === "PENDIENTE"
                                ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                                : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                            }`}
                          >
                            {m.estado === "PENDIENTE" ? "Pendiente" : "Pagado"}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                          {[
                            m.ot?.numeroOT,
                            m.ot?.solicitud?.camioneta?.patente,
                            m.fechaPago
                              ? `pago ${new Date(m.fechaPago).toLocaleDateString("es-AR")}`
                              : null,
                            m.metodoPago ? m.metodoPago.toLowerCase() : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Sin OT asociada"}
                        </div>
                      </div>
                    </div>
                    {m.estado === "PENDIENTE" ? (
                      <button
                        type="button"
                        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
                        onClick={() => openPago(s.id, [m.id])}
                      >
                        Marcar pagado
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3.5 py-2 text-xs font-semibold text-[var(--vl-heading)] hover:bg-slate-50 dark:hover:bg-slate-800"
                        onClick={() => void revertirPago(s.id, m.id)}
                      >
                        Revertir pago
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
              );
            })}
          {saldos.filter((s) =>
            ccVista === "pendiente" ? s.pendiente > 0 : s.pagado > 0
          ).length === 0 && (
            <p className="text-sm text-[var(--vl-text-muted)]">
              {ccVista === "pendiente"
                ? "No hay deudas pendientes. Lo pagado está en el historial."
                : "Todavía no hay pagos registrados."}
            </p>
          )}
        </div>
      )}

      {(creating || editing) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => { setCreating(false); setEditing(null); }}>
          <div className="w-full max-w-md rounded-t-2xl bg-[var(--vl-card)] p-4 sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-bold text-[var(--vl-heading)]">
              {editing ? "Editar taller" : "Nuevo taller"}
            </h3>
            <label className="block text-xs">CUIT<input className={input} value={cuit} onChange={(e) => setCuit(e.target.value)} /></label>
            <label className="mt-2 block text-xs">Razón social<input className={input} value={razon} onChange={(e) => setRazon(e.target.value)} /></label>
            <label className="mt-2 block text-xs">Dirección<input className={input} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></label>
            <label className="mt-2 block text-xs">Mail<input className={input} value={mail} onChange={(e) => setMail(e.target.value)} /></label>
            <label className="mt-2 block text-xs">Celular<input className={input} value={celular} onChange={(e) => setCelular(e.target.value)} /></label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={whatsapp}
                onChange={(e) => setWhatsapp(e.target.checked)}
              />
              WhatsApp
            </label>
            <label className="mt-2 block text-xs">Alias / CBU<input className={input} value={alias} onChange={(e) => setAlias(e.target.value)} /></label>
            <p className="mt-3 text-xs font-medium text-[var(--vl-text-muted)]">Tipos de taller</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tiposLista.map((tipo) => {
                const on = selTipos.includes(tipo);
                return (
                  <TipoChip
                    key={tipo}
                    tipo={tipo}
                    selected={on}
                    onClick={() =>
                      setSelTipos((p) =>
                        on ? p.filter((x) => x !== tipo) : [...p, tipo]
                      )
                    }
                  />
                );
              })}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void save()} className="flex-1 rounded-md bg-slate-900 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900">
                Guardar
              </button>
              <button type="button" onClick={() => { setCreating(false); setEditing(null); }} className="rounded-md border px-3 py-2 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {contactoTaller && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setContactoTaller(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-[var(--vl-card)] p-4 sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 font-bold text-[var(--vl-heading)]">Contacto</h3>
            <p className="mb-3 text-sm text-[var(--vl-text-muted)]">
              {contactoTaller.razonSocial}
            </p>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-[var(--vl-text-muted)]">Mail</dt>
                <dd>{contactoTaller.mail || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--vl-text-muted)]">Celular</dt>
                <dd>{contactoTaller.celular || "—"}</dd>
              </div>
            </dl>
            {(contactoTaller.whatsapp || contactoTaller.celular) &&
              whatsappDigits(contactoTaller.celular) && (
                <a
                  href={`https://wa.me/${whatsappDigits(contactoTaller.celular)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  WhatsApp
                </a>
              )}
            <button
              type="button"
              className="mt-4 w-full rounded-md border border-[var(--vl-card-border)] py-2 text-sm"
              onClick={() => setContactoTaller(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {pagoModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => !pagoSaving && setPagoModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-[var(--vl-card)] p-4 sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 font-bold text-[var(--vl-heading)]">Registrar pago</h3>
            <p className="mb-3 text-xs text-[var(--vl-text-muted)]">
              {pagoModal.movIds.length === 1
                ? `1 ítem seleccionado`
                : `${pagoModal.movIds.length} ítems seleccionados`}
              . La suma de métodos debe cubrir ese total.
            </p>
            <div className="mb-3 rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--vl-text-muted)]">
                Monto a pagar (ítems seleccionados)
              </p>
              <p className="text-lg font-bold text-[var(--vl-heading)]">
                {money(pagoModal.totalAdeudado)}
              </p>
            </div>
            <label className="block text-xs">
              Fecha
              <input
                type="date"
                required
                className={input}
                value={pagoFecha}
                onChange={(e) => setPagoFecha(e.target.value)}
              />
            </label>

            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[var(--vl-heading)]">
                  Métodos de pago
                </p>
                <p className="text-[10px] text-[var(--vl-text-muted)]">
                  Suma {money(pagoSumaMetodos)}
                  {pagoFalta > 0.009
                    ? ` · faltan ${money(pagoFalta)}`
                    : pagoFalta < -0.009
                      ? ` · sobran ${money(-pagoFalta)}`
                      : " · completo"}
                </p>
              </div>
              <p className="text-[10px] text-[var(--vl-text-muted)]">
                Si un método no alcanza el total, se agrega otro con el resto
                automáticamente.
              </p>
              {pagoLineas.map((linea, idx) => (
                <div
                  key={linea.key}
                  className="rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-2.5"
                >
                  <p className="mb-1.5 text-[10px] font-medium text-[var(--vl-text-muted)]">
                    Método {idx + 1}
                  </p>
                  <label className="block text-xs">
                    Tipo
                    <select
                      className={input}
                      value={linea.metodo}
                      onChange={(e) =>
                        updatePagoLinea(linea.key, {
                          metodo: e.target.value as MetodoPagoLinea,
                        })
                      }
                    >
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="EFECTIVO">Efectivo</option>
                    </select>
                  </label>
                  <label className="mt-2 block text-xs">
                    Monto
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={input}
                      value={linea.monto}
                      onChange={(e) =>
                        updatePagoLinea(linea.key, { monto: e.target.value })
                      }
                      placeholder="0"
                    />
                  </label>
                  <label className="mt-2 block text-xs">
                    Detalle (opcional)
                    <input
                      className={input}
                      value={linea.detalle}
                      onChange={(e) =>
                        updatePagoLinea(linea.key, { detalle: e.target.value })
                      }
                      placeholder={
                        linea.metodo === "CHEQUE"
                          ? "Nº cheque, banco…"
                          : linea.metodo === "TRANSFERENCIA"
                            ? "Nº operación, banco…"
                            : "Referencia…"
                      }
                    />
                  </label>
                </div>
              ))}
            </div>

            <label className="mt-2 block text-xs">
              Observación (opcional)
              <textarea
                className={input}
                rows={2}
                value={pagoObs}
                onChange={(e) => setPagoObs(e.target.value)}
              />
            </label>
            {pagoError && (
              <p className="mt-2 text-sm text-red-600">{pagoError}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={pagoSaving}
                onClick={() => void confirmarPago()}
                className="flex-1 rounded-md bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pagoSaving ? "Guardando…" : "Confirmar"}
              </button>
              <button
                type="button"
                disabled={pagoSaving}
                onClick={() => setPagoModal(null)}
                className="rounded-md border px-3 py-2 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
