import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import {
  TIPO_TALLER_LABEL,
  canWriteMaster,
  type TallerProveedor,
  type TipoTaller,
} from "../../types";

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

function whatsappDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = `54${digits.slice(1)}`;
  if (digits.length < 8) return null;
  return digits;
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
  const [contactoTaller, setContactoTaller] = useState<TallerProveedor | null>(null);
  const [pagoModal, setPagoModal] = useState<{
    tallerId: string;
    movId: string;
  } | null>(null);
  const [pagoFecha, setPagoFecha] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [pagoMetodo, setPagoMetodo] = useState<
    "TRANSFERENCIA" | "CHEQUE" | "EFECTIVO"
  >("TRANSFERENCIA");
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

  function openPago(tallerId: string, movId: string) {
    setPagoModal({ tallerId, movId });
    setPagoFecha(new Date().toISOString().slice(0, 10));
    setPagoMetodo("TRANSFERENCIA");
    setPagoError(null);
  }

  async function confirmarPago() {
    if (!token || !pagoModal) return;
    if (!pagoFecha) {
      setPagoError("La fecha es obligatoria");
      return;
    }
    if (!pagoMetodo) {
      setPagoError("El método es obligatorio");
      return;
    }
    setPagoSaving(true);
    setPagoError(null);
    try {
      await apiFetch(
        `/api/talleres-proveedores/${pagoModal.tallerId}/movimientos/${pagoModal.movId}/pagar`,
        {
          method: "POST",
          body: JSON.stringify({ fechaPago: pagoFecha, metodoPago: pagoMetodo }),
        },
        token
      );
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
                {items.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-t border-[var(--vl-card-border)] hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    onClick={() => setContactoTaller(t)}
                  >
                    <td className="px-3 py-2">{t.cuit}</td>
                    <td className="px-3 py-2">{t.razonSocial}</td>
                    <td className="px-3 py-2 text-xs">
                      {(t.tipos ?? []).map((x) => TIPO_TALLER_LABEL[x.tipo] ?? x.tipo).join(", ") || "—"}
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
              ? "Solo se listan deudas abiertas. Lo ya cobrado queda guardado en el historial."
              : "Historial de pagos. Podés revertir un cobro si se cargó mal."}
          </p>
          {saldos
            .filter((s) => (ccVista === "pendiente" ? s.pendiente > 0 : s.pagado > 0))
            .map((s) => (
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
                <div className="flex flex-wrap gap-2">
                  {ccVista === "pendiente" ? (
                  <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
                    Pendiente {money(s.pendiente)}
                  </span>
                  ) : (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                    Pagado {money(s.pagado)}
                  </span>
                  )}
                </div>
              </div>
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
                    {m.estado === "PENDIENTE" ? (
                      <button
                        type="button"
                        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
                        onClick={() => openPago(s.id, m.id)}
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
          ))}
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tipos.map((tipo) => {
                const on = selTipos.includes(tipo);
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setSelTipos((p) => (on ? p.filter((x) => x !== tipo) : [...p, tipo]))}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--vl-card-border)]"}`}
                  >
                    {TIPO_TALLER_LABEL[tipo] ?? tipo}
                  </button>
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
            className="w-full max-w-sm rounded-t-2xl bg-[var(--vl-card)] p-4 sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 font-bold text-[var(--vl-heading)]">Registrar pago</h3>
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
            <label className="mt-2 block text-xs">
              Método
              <select
                className={input}
                value={pagoMetodo}
                onChange={(e) =>
                  setPagoMetodo(
                    e.target.value as "TRANSFERENCIA" | "CHEQUE" | "EFECTIVO"
                  )
                }
              >
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="CHEQUE">Cheque</option>
                <option value="EFECTIVO">Efectivo</option>
              </select>
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
