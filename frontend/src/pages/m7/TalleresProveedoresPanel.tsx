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

export function TalleresProveedoresPanel() {
  const { token, user } = useAuth();
  const canEdit = canWriteMaster(user?.rol);
  const [tab, setTab] = useState<"abm" | "cc">("abm");
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
  const [alias, setAlias] = useState("");
  const [selTipos, setSelTipos] = useState<TipoTaller[]>([]);

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

  function openForm(t?: TallerProveedor) {
    setEditing(t ?? null);
    setCreating(!t);
    setCuit(t?.cuit ?? "");
    setRazon(t?.razonSocial ?? "");
    setDireccion(t?.direccion ?? "");
    setMail(t?.mail ?? "");
    setCelular(t?.celular ?? "");
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

  async function marcarPago(tallerId: string, movId: string) {
    if (!token) return;
    const fechaPago = window.prompt("Fecha de pago (AAAA-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!fechaPago) return;
    const metodoRaw = window.prompt("Método: transferencia, cheque o efectivo", "transferencia");
    if (!metodoRaw) return;
    const metodoPago = metodoRaw.trim().toUpperCase();
    await apiFetch(
      `/api/talleres-proveedores/${tallerId}/movimientos/${movId}/pagar`,
      { method: "POST", body: JSON.stringify({ fechaPago, metodoPago }) },
      token
    );
    await load();
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
                  <tr key={t.id} className="border-t border-[var(--vl-card-border)]">
                    <td className="px-3 py-2">{t.cuit}</td>
                    <td className="px-3 py-2">{t.razonSocial}</td>
                    <td className="px-3 py-2 text-xs">
                      {(t.tipos ?? []).map((x) => TIPO_TALLER_LABEL[x.tipo] ?? x.tipo).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">{t.aliasCbu ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {canEdit && (
                        <button type="button" className="text-xs underline" onClick={() => openForm(t)}>
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
          {saldos.map((s) => (
            <div key={s.id} className="rounded-xl border border-[var(--vl-card-border)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-semibold text-[var(--vl-heading)]">{s.razonSocial}</div>
                <div className="text-sm">
                  Pendiente <strong>{money(s.pendiente)}</strong>
                  <span className="ml-2 text-[var(--vl-text-muted)]">Pagado {money(s.pagado)}</span>
                </div>
              </div>
              {s.aliasCbu && (
                <div className="mt-1 text-[11px] text-[var(--vl-text-muted)]">Alias/CBU: {s.aliasCbu}</div>
              )}
              <ul className="mt-2 space-y-1 text-xs">
                {s.movimientos.slice(0, 8).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span>
                      {money(m.montoFacturado)} · {m.estado.toLowerCase()}
                      {m.ot?.numeroOT ? ` · ${m.ot.numeroOT}` : ""}
                      {m.ot?.solicitud?.camioneta?.patente
                        ? ` · ${m.ot.solicitud.camioneta.patente}`
                        : ""}
                      {m.fechaPago
                        ? ` · pago ${new Date(m.fechaPago).toLocaleDateString("es-AR")}`
                        : ""}
                      {m.metodoPago ? ` · ${m.metodoPago.toLowerCase()}` : ""}
                    </span>
                    {m.estado === "PENDIENTE" ? (
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void marcarPago(s.id, m.id)}
                      >
                        Marcar pagado
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void revertirPago(s.id, m.id)}
                      >
                        Revertir
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {saldos.length === 0 && (
            <p className="text-sm text-[var(--vl-text-muted)]">
              Todavía no hay movimientos. Se generan al cerrar una OT con factura.
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
    </div>
  );
}
