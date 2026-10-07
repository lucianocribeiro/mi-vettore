import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Download, Upload, X } from "../../components/icons";
import { apiDownload, apiFetch, ApiError } from "../../lib/api";

export type HojaFlota = "empresas" | "choferes" | "unidades";

type Conteo = { empresas: number; choferes: number; unidades: number };

type Revision = {
  ok: boolean;
  dryRun?: boolean;
  stats?: Conteo;
  errores?: { hoja: string; fila: number; mensaje: string }[];
};

type Resultado = {
  ok: true;
  creados: Conteo;
  actualizados: Conteo;
  omitidos: string[];
  avisos: string[];
  credenciales: { tipo: "EMPRESA" | "CHOFER"; usuario: string; nombre: string; password: string }[];
};

const LABEL: Record<HojaFlota, { titulo: string; plural: string }> = {
  empresas: { titulo: "Empresas", plural: "empresas" },
  choferes: { titulo: "Choferes", plural: "choferes" },
  unidades: { titulo: "Unidades", plural: "unidades" },
};

function descargarCredenciales(rows: Resultado["credenciales"]) {
  const csv = [
    "Tipo;Usuario;Nombre;Contraseña temporal",
    ...rows.map((r) => [r.tipo, r.usuario, r.nombre, r.password].join(";")),
  ].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `accesos_flota_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function FlotaImportPanel({
  hoja,
  onImported,
}: {
  hoja: HojaFlota;
  onImported: () => void;
}) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"nuevos" | "actualizar">("nuevos");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const { titulo, plural } = LABEL[hoja];

  function reset() {
    setFile(null);
    setRevision(null);
    setResultado(null);
    setErr(null);
  }

  async function enviar(dryRun: boolean) {
    if (!token || !file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("hoja", hoja);
      fd.append("modo", modo);
      if (dryRun) fd.append("dryRun", "1");
      const data = await apiFetch<Revision | Resultado>(
        "/api/flota/import",
        { method: "POST", body: fd },
        token
      );
      if (dryRun || !data.ok || !("creados" in data)) {
        setRevision(data as Revision);
        return;
      }
      setResultado(data);
      onImported();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "No se pudo importar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2 text-sm font-medium text-[var(--vl-text)] hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <Upload size={14} />
        Importar {plural}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => !busy && setOpen(false)}>
          <div
            className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-[var(--vl-card)] p-5 sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-[var(--vl-heading)]">Importar {plural} desde Excel</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" disabled={busy}>
                <X size={18} />
              </button>
            </div>

            {resultado ? (
              <div className="space-y-3 text-sm">
                <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  Creados: {resultado.creados[hoja]} {plural}
                  <br />
                  Actualizados: {resultado.actualizados[hoja]} {plural}
                </p>
                {resultado.credenciales.length > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                        Contraseñas temporales: guardalas ahora, no se vuelven a mostrar.
                      </p>
                      <button
                        type="button"
                        onClick={() => descargarCredenciales(resultado.credenciales)}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-400 px-2 py-1 text-xs font-semibold text-amber-900 dark:text-amber-200"
                      >
                        <Download size={12} /> Descargar CSV
                      </button>
                    </div>
                    <table className="mt-2 w-full text-xs">
                      <thead className="text-left text-[var(--vl-text-muted)]">
                        <tr>
                          <th className="py-1">Tipo</th>
                          <th>Usuario</th>
                          <th>Nombre</th>
                          <th>Contraseña</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.credenciales.map((c) => (
                          <tr key={`${c.tipo}-${c.usuario}`} className="border-t border-amber-200 dark:border-amber-900">
                            <td className="py-1">{c.tipo === "EMPRESA" ? "Empresa" : "Chofer"}</td>
                            <td className="font-mono">{c.usuario}</td>
                            <td>{c.nombre}</td>
                            <td className="font-mono font-semibold">{c.password}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {resultado.omitidos.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold">Salteados ({resultado.omitidos.length})</summary>
                    <ul className="mt-1 list-disc pl-5 text-[var(--vl-text-muted)]">
                      {resultado.omitidos.map((o) => <li key={o}>{o}</li>)}
                    </ul>
                  </details>
                )}
                {resultado.avisos.length > 0 && (
                  <details className="text-xs" open>
                    <summary className="cursor-pointer font-semibold text-amber-800 dark:text-amber-300">Avisos ({resultado.avisos.length})</summary>
                    <ul className="mt-1 list-disc pl-5 text-[var(--vl-text-muted)]">
                      {resultado.avisos.map((o) => <li key={o}>{o}</li>)}
                    </ul>
                  </details>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="min-h-10 w-full rounded-md bg-slate-900 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  Listo
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-xs text-[var(--vl-text-muted)]">
                  Mismo formato que el Excel que se exporta desde la pestaña {titulo}. Primero se revisa el archivo; si no hay errores, se importa.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    token &&
                    void apiDownload(`/api/flota/plantilla?hoja=${hoja}`, token, `plantilla_${hoja}.xlsx`)
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs font-semibold"
                >
                  <Download size={13} /> Descargar plantilla
                </button>
                <div className="flex flex-wrap gap-4 text-xs">
                  <label className="inline-flex items-center gap-1.5">
                    <input type="radio" checked={modo === "nuevos"} onChange={() => { setModo("nuevos"); setRevision(null); }} />
                    Datos nuevos (saltea lo que ya existe)
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input type="radio" checked={modo === "actualizar"} onChange={() => { setModo("actualizar"); setRevision(null); }} />
                    Actualizar datos existentes
                  </label>
                </div>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setRevision(null);
                  }}
                  className="block w-full text-xs"
                />

                {revision && (
                  revision.ok ? (
                    <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                      Archivo OK: {revision.stats?.[hoja] ?? 0} {plural}. Podés importar.
                    </p>
                  ) : (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                      <p className="font-semibold">Corregí estos errores y volvé a subir el archivo:</p>
                      <ul className="mt-1 list-disc pl-5">
                        {(revision.errores ?? []).slice(0, 30).map((e, i) => (
                          <li key={i}>
                            {e.fila ? `Fila ${e.fila}: ` : ""}{e.mensaje}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                )}
                {err && <p className="text-sm text-red-600">{err}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!file || busy}
                    onClick={() => void enviar(true)}
                    className="min-h-10 flex-1 rounded-md border border-[var(--vl-card-border)] text-sm font-medium disabled:opacity-40"
                  >
                    {busy && !revision ? "Revisando…" : "Revisar archivo"}
                  </button>
                  <button
                    type="button"
                    disabled={!file || busy || !revision?.ok}
                    onClick={() => void enviar(false)}
                    className="min-h-10 flex-1 rounded-md bg-slate-900 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
                  >
                    {busy && revision?.ok ? "Importando…" : "Importar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
