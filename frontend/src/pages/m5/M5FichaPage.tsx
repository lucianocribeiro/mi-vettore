import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
  Badge,
  ESTADO_CAMIONETA_STYLE,
  ESTADO_CHOFER_STYLE,
} from "../../components/Badge";
import { Plus } from "../../components/icons";
import { apiFetch, ApiError } from "../../lib/api";
import {
  ALL_ROLES,
  ROLE_LABELS,
  canWriteMaster,
  currentAsignacion,
  type Camioneta,
  type Cliente,
  type Chofer,
  type Empresa,
  type Role,
  type SegmentoCliente,
  type TipoEmpresa,
  type User,
} from "../../types";
import { FichaDrawer } from "./FichaDrawer";
import { Field, FormModal, inputClass } from "./FormModal";

type Tab = "camioneta" | "chofer" | "clientes" | "empresas" | "usuarios";

type DrawerOpen =
  | { tipo: "camioneta"; item: Camioneta }
  | { tipo: "chofer"; item: Chofer }
  | null;

export function M5FichaPage() {
  const { token, user } = useAuth();
  const canEdit = canWriteMaster(user?.rol);

  const [tab, setTab] = useState<Tab>("camioneta");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [camionetas, setCamionetas] = useState<Camioneta[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [usuarios, setUsuarios] = useState<User[]>([]);

  const [drawer, setDrawer] = useState<DrawerOpen>(null);
  const [form, setForm] = useState<
    | null
    | { kind: "cliente"; item?: Cliente }
    | { kind: "chofer"; item?: Chofer }
    | { kind: "empresa"; item?: Empresa }
    | { kind: "camioneta"; item?: Camioneta }
    | { kind: "usuario"; item?: User }
  >(null);
  const [formError, setFormError] = useState<string | null>(null);

  // form drafts
  const [fNombre, setFNombre] = useState("");
  const [fContacto, setFContacto] = useState("");
  const [fSegmento, setFSegmento] = useState<SegmentoCliente>("ESTATICO");
  const [fDni, setFDni] = useState("");
  const [fLicencia, setFLicencia] = useState("");
  const [fTelefono, setFTelefono] = useState("");
  const [fEstadoChofer, setFEstadoChofer] = useState<"ACTIVO" | "INACTIVO">(
    "ACTIVO"
  );
  const [fTipoEmpresa, setFTipoEmpresa] = useState<TipoEmpresa>("PROPIA");
  const [fPatente, setFPatente] = useState("");
  const [fDatosTecnicos, setFDatosTecnicos] = useState("");
  const [fKm, setFKm] = useState("0");
  const [fEstadoCam, setFEstadoCam] = useState<
    "OPERATIVA" | "EN_TALLER" | "DE_VACACIONES" | "FUERA_SERVICIO"
  >("OPERATIVA");
  const [fChoferId, setFChoferId] = useState("");
  const [fEmpresaId, setFEmpresaId] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fRol, setFRol] = useState<Role>("CLIENTE");
  const [fEstadoUser, setFEstadoUser] = useState<"ACTIVO" | "INACTIVO">(
    "ACTIVO"
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [cami, chof, cli, emp, usu] = await Promise.all([
        apiFetch<Camioneta[]>("/api/camionetas", {}, token),
        apiFetch<Chofer[]>("/api/choferes", {}, token),
        apiFetch<Cliente[]>("/api/clientes", {}, token),
        apiFetch<Empresa[]>("/api/empresas", {}, token),
        apiFetch<User[]>("/api/usuarios", {}, token),
      ]);
      setCamionetas(cami);
      setChoferes(chof);
      setClientes(cli);
      setEmpresas(emp);
      setUsuarios(usu);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate(kind: NonNullable<typeof form>["kind"]) {
    setFormError(null);
    setFNombre("");
    setFContacto("");
    setFSegmento("ESTATICO");
    setFDni("");
    setFLicencia("");
    setFTelefono("");
    setFEstadoChofer("ACTIVO");
    setFTipoEmpresa("PROPIA");
    setFPatente("");
    setFDatosTecnicos("");
    setFKm("0");
    setFEstadoCam("OPERATIVA");
    setFChoferId("");
    setFEmpresaId("");
    setFEmail("");
    setFPassword("");
    setFRol("CLIENTE");
    setFEstadoUser("ACTIVO");
    setForm({ kind });
  }

  function openEditCliente(item: Cliente) {
    setFormError(null);
    setFNombre(item.nombre);
    setFContacto(item.contacto ?? "");
    setFSegmento(item.segmento);
    setForm({ kind: "cliente", item });
  }

  function openEditChofer(item: Chofer) {
    setFormError(null);
    setFNombre(item.nombre);
    setFDni(item.dni);
    setFLicencia(item.licencia ?? "");
    setFTelefono(item.telefono ?? "");
    setFEstadoChofer(item.estado);
    setForm({ kind: "chofer", item });
  }

  function openEditEmpresa(item: Empresa) {
    setFormError(null);
    setFNombre(item.nombre);
    setFTipoEmpresa(item.tipo);
    setForm({ kind: "empresa", item });
  }

  function openEditCamioneta(item: Camioneta) {
    setFormError(null);
    setFPatente(item.patente);
    setFDatosTecnicos(item.datosTecnicos ?? "");
    setFKm(String(item.km));
    setFEstadoCam(item.estado);
    const a = currentAsignacion(item);
    setFChoferId(a?.choferId ?? "");
    setFEmpresaId(a?.empresaId ?? "");
    setForm({ kind: "camioneta", item });
  }

  function openEditUsuario(item: User) {
    setFormError(null);
    setFNombre(item.nombre ?? "");
    setFEmail(item.email);
    setFPassword("");
    setFRol(item.rol);
    setFEstadoUser(item.estado);
    setForm({ kind: "usuario", item });
  }

  async function submitForm() {
    if (!token || !form) return;
    setFormError(null);
    try {
      if (form.kind === "cliente") {
        const body = {
          nombre: fNombre,
          contacto: fContacto || null,
          segmento: fSegmento,
        };
        if (form.item) {
          const updated = await apiFetch<Cliente>(
            `/api/clientes/${form.item.id}`,
            { method: "PUT", body: JSON.stringify(body) },
            token
          );
          setClientes((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c))
          );
        } else {
          const created = await apiFetch<Cliente>(
            "/api/clientes",
            { method: "POST", body: JSON.stringify(body) },
            token
          );
          setClientes((prev) => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        }
      }

      if (form.kind === "chofer") {
        const body = {
          nombre: fNombre,
          dni: fDni,
          licencia: fLicencia || null,
          telefono: fTelefono || null,
          estado: fEstadoChofer,
        };
        if (form.item) {
          const updated = await apiFetch<Chofer>(
            `/api/choferes/${form.item.id}`,
            { method: "PUT", body: JSON.stringify(body) },
            token
          );
          setChoferes((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c))
          );
          if (drawer?.tipo === "chofer" && drawer.item.id === updated.id) {
            setDrawer({ tipo: "chofer", item: updated });
          }
        } else {
          const created = await apiFetch<Chofer>(
            "/api/choferes",
            { method: "POST", body: JSON.stringify(body) },
            token
          );
          setChoferes((prev) =>
            [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre))
          );
        }
      }

      if (form.kind === "empresa") {
        const body = { nombre: fNombre, tipo: fTipoEmpresa };
        if (form.item) {
          const updated = await apiFetch<Empresa>(
            `/api/empresas/${form.item.id}`,
            { method: "PUT", body: JSON.stringify(body) },
            token
          );
          setEmpresas((prev) =>
            prev.map((e) => (e.id === updated.id ? updated : e))
          );
        } else {
          const created = await apiFetch<Empresa>(
            "/api/empresas",
            { method: "POST", body: JSON.stringify(body) },
            token
          );
          setEmpresas((prev) =>
            [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre))
          );
        }
      }

      if (form.kind === "camioneta") {
        const body = {
          patente: fPatente,
          datosTecnicos: fDatosTecnicos || null,
          km: Number(fKm) || 0,
          estado: fEstadoCam,
          choferId: fChoferId || undefined,
          empresaId: fEmpresaId || undefined,
        };
        if (form.item) {
          let updated = await apiFetch<Camioneta>(
            `/api/camionetas/${form.item.id}`,
            {
              method: "PUT",
              body: JSON.stringify({
                patente: body.patente,
                datosTecnicos: body.datosTecnicos,
                km: body.km,
                estado: body.estado,
              }),
            },
            token
          );
          const cur = currentAsignacion(updated);
          if (
            fChoferId &&
            fEmpresaId &&
            (cur?.choferId !== fChoferId || cur?.empresaId !== fEmpresaId)
          ) {
            updated = await apiFetch<Camioneta>(
              `/api/camionetas/${form.item.id}/asignacion`,
              {
                method: "POST",
                body: JSON.stringify({
                  choferId: fChoferId,
                  empresaId: fEmpresaId,
                }),
              },
              token
            );
          }
          setCamionetas((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c))
          );
          if (drawer?.tipo === "camioneta" && drawer.item.id === updated.id) {
            setDrawer({ tipo: "camioneta", item: updated });
          }
        } else {
          const created = await apiFetch<Camioneta>(
            "/api/camionetas",
            { method: "POST", body: JSON.stringify(body) },
            token
          );
          setCamionetas((prev) =>
            [...prev, created].sort((a, b) =>
              a.patente.localeCompare(b.patente)
            )
          );
        }
      }

      if (form.kind === "usuario") {
        const body: Record<string, unknown> = {
          email: fEmail,
          rol: fRol,
          nombre: fNombre || null,
          estado: fEstadoUser,
        };
        if (fPassword) body.password = fPassword;
        if (form.item) {
          const updated = await apiFetch<User>(
            `/api/usuarios/${form.item.id}`,
            { method: "PUT", body: JSON.stringify(body) },
            token
          );
          setUsuarios((prev) =>
            prev.map((u) => (u.id === updated.id ? updated : u))
          );
        } else {
          if (!fPassword) {
            setFormError("Password obligatorio para usuarios nuevos");
            return;
          }
          body.password = fPassword;
          const created = await apiFetch<User>(
            "/api/usuarios",
            { method: "POST", body: JSON.stringify(body) },
            token
          );
          setUsuarios((prev) =>
            [...prev, created].sort((a, b) => a.email.localeCompare(b.email))
          );
        }
      }

      setForm(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Error al guardar");
    }
  }

  async function deleteEntity(
    kind: "cliente" | "chofer" | "empresa" | "camioneta" | "usuario",
    id: string
  ) {
    if (!token || !canEdit) return;
    if (!confirm("¿Eliminar este registro?")) return;
    const paths = {
      cliente: `/api/clientes/${id}`,
      chofer: `/api/choferes/${id}`,
      empresa: `/api/empresas/${id}`,
      camioneta: `/api/camionetas/${id}`,
      usuario: `/api/usuarios/${id}`,
    };
    try {
      await apiFetch(paths[kind], { method: "DELETE" }, token);
      if (kind === "cliente") setClientes((p) => p.filter((x) => x.id !== id));
      if (kind === "chofer") setChoferes((p) => p.filter((x) => x.id !== id));
      if (kind === "empresa") setEmpresas((p) => p.filter((x) => x.id !== id));
      if (kind === "camioneta")
        setCamionetas((p) => p.filter((x) => x.id !== id));
      if (kind === "usuario") setUsuarios((p) => p.filter((x) => x.id !== id));
      setDrawer(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "camioneta", label: "Vista por camioneta" },
    { id: "chofer", label: "Vista por chofer" },
    { id: "clientes", label: "Clientes" },
    { id: "empresas", label: "Empresas" },
    { id: "usuarios", label: "Usuarios" },
  ];

  return (
    <div>
      <div className="mb-5 sm:mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            M5 · MVP
          </span>
          <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
            Ficha integral: camioneta / chofer / empresa
          </h1>
        </div>
        <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
          Registro maestro y ABM: reasignar patentes desde acá, con historial
          conservado.
        </p>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {canEdit && (
        <div className="mb-4">
          {(tab === "camioneta" || tab === "chofer" || tab === "clientes" || tab === "empresas" || tab === "usuarios") && (
            <button
              type="button"
              onClick={() =>
                openCreate(
                  tab === "camioneta"
                    ? "camioneta"
                    : tab === "chofer"
                      ? "chofer"
                      : tab === "clientes"
                        ? "cliente"
                        : tab === "empresas"
                          ? "empresa"
                          : "usuario"
                )
              }
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              <Plus size={14} />
              Nuevo{" "}
              {tab === "camioneta"
                ? "camioneta"
                : tab === "chofer"
                  ? "chofer"
                  : tab === "clientes"
                    ? "cliente"
                    : tab === "empresas"
                      ? "empresa"
                      : "usuario"}
            </button>
          )}
        </div>
      )}

      {!canEdit && (
        <p className="mb-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          Solo lectura: tu rol no puede crear ni editar datos maestros.
        </p>
      )}

      {loading && (
        <p className="text-sm text-slate-500">Cargando datos maestros…</p>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && tab === "camioneta" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {camionetas.map((c) => {
            const a = currentAsignacion(c);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setDrawer({ tipo: "camioneta", item: c })}
                className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4 text-left transition hover:border-slate-400 hover:shadow-sm dark:hover:border-slate-500"
              >
                <div className="font-semibold text-[var(--vl-heading)]">{c.patente}</div>
                <div className="mt-1 text-xs text-[var(--vl-text-muted)]">
                  {a?.empresa?.nombre ?? "Sin empresa"} ·{" "}
                  {a?.chofer?.nombre ?? "Sin chofer"} ·{" "}
                  {c.km.toLocaleString("es-AR")} km
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge className={ESTADO_CAMIONETA_STYLE[c.estado]}>
                    {c.estado.replace("_", " ").toLowerCase()}
                  </Badge>
                  {canEdit && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditCamioneta(c);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          openEditCamioneta(c);
                        }
                      }}
                      className="text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
                    >
                      Editar
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!loading && !error && tab === "chofer" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {choferes.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setDrawer({ tipo: "chofer", item: c })}
              className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4 text-left transition hover:border-slate-400 hover:shadow-sm dark:hover:border-slate-500"
            >
              <div className="font-semibold text-[var(--vl-heading)]">{c.nombre}</div>
              <div className="mt-1 text-xs text-[var(--vl-text-muted)]">
                DNI {c.dni} · Licencia {c.licencia || "—"}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge className={ESTADO_CHOFER_STYLE[c.estado]}>
                  {c.estado.toLowerCase()}
                </Badge>
                {canEdit && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditChofer(c);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        openEditChofer(c);
                      }
                    }}
                    className="text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
                  >
                    Editar
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && !error && tab === "clientes" && (
        <EntityTable
          headers={["Nombre", "Segmento", "Contacto", ""]}
          rows={clientes.map((c) => [
            c.nombre,
            c.segmento.toLowerCase(),
            c.contacto || "—",
            canEdit ? (
              <Actions
                onEdit={() => openEditCliente(c)}
                onDelete={() => void deleteEntity("cliente", c.id)}
              />
            ) : (
              ""
            ),
          ])}
        />
      )}

      {!loading && !error && tab === "empresas" && (
        <EntityTable
          headers={["Nombre", "Tipo", ""]}
          rows={empresas.map((e) => [
            e.nombre,
            e.tipo.toLowerCase(),
            canEdit ? (
              <Actions
                onEdit={() => openEditEmpresa(e)}
                onDelete={() => void deleteEntity("empresa", e.id)}
              />
            ) : (
              ""
            ),
          ])}
        />
      )}

      {!loading && !error && tab === "usuarios" && (
        <EntityTable
          headers={["Email", "Nombre", "Rol", "Estado", ""]}
          rows={usuarios.map((u) => [
            u.email,
            u.nombre || "—",
            ROLE_LABELS[u.rol],
            u.estado.toLowerCase(),
            canEdit ? (
              <Actions
                onEdit={() => openEditUsuario(u)}
                onDelete={() => void deleteEntity("usuario", u.id)}
              />
            ) : (
              ""
            ),
          ])}
        />
      )}

      {drawer && (
        <FichaDrawer
          open={drawer}
          onClose={() => setDrawer(null)}
          choferes={choferes}
          empresas={empresas}
          canEdit={canEdit}
          onUpdated={(tipo, item) => {
            if (tipo === "camioneta") {
              const c = item as Camioneta;
              setCamionetas((prev) =>
                prev.map((x) => (x.id === c.id ? c : x))
              );
              setDrawer({ tipo: "camioneta", item: c });
            } else {
              const c = item as Chofer;
              setChoferes((prev) => prev.map((x) => (x.id === c.id ? c : x)));
              setDrawer({ tipo: "chofer", item: c });
            }
          }}
        />
      )}

      {form && (
        <FormModal
          title={
            form.item
              ? `Editar ${form.kind}`
              : `Nuevo ${form.kind}`
          }
          onClose={() => setForm(null)}
          onSubmit={submitForm}
          error={formError}
        >
          {(form.kind === "cliente" ||
            form.kind === "chofer" ||
            form.kind === "empresa" ||
            form.kind === "usuario") && (
            <Field label="Nombre">
              <input
                className={inputClass}
                value={fNombre}
                onChange={(e) => setFNombre(e.target.value)}
                required={form.kind !== "usuario"}
              />
            </Field>
          )}

          {form.kind === "cliente" && (
            <>
              <Field label="Segmento">
                <select
                  className={inputClass}
                  value={fSegmento}
                  onChange={(e) =>
                    setFSegmento(e.target.value as SegmentoCliente)
                  }
                >
                  <option value="ESTATICO">Estático (plan fijo)</option>
                  <option value="CONSULTA">
                    Consulta (demanda variable · M3 12:00)
                  </option>
                  <option value="CONFIRMACION">
                    Confirmación (demanda variable · M3 12:00)
                  </option>
                </select>
              </Field>
              <Field label="Contacto">
                <input
                  className={inputClass}
                  value={fContacto}
                  onChange={(e) => setFContacto(e.target.value)}
                />
              </Field>
            </>
          )}

          {form.kind === "chofer" && (
            <>
              <Field label="DNI">
                <input
                  className={inputClass}
                  value={fDni}
                  onChange={(e) => setFDni(e.target.value)}
                  required
                />
              </Field>
              <Field label="Licencia">
                <input
                  className={inputClass}
                  value={fLicencia}
                  onChange={(e) => setFLicencia(e.target.value)}
                />
              </Field>
              <Field label="Teléfono">
                <input
                  className={inputClass}
                  value={fTelefono}
                  onChange={(e) => setFTelefono(e.target.value)}
                />
              </Field>
              <Field label="Estado">
                <select
                  className={inputClass}
                  value={fEstadoChofer}
                  onChange={(e) =>
                    setFEstadoChofer(e.target.value as "ACTIVO" | "INACTIVO")
                  }
                >
                  <option value="ACTIVO">Activo</option>
                  <option value="INACTIVO">Inactivo</option>
                </select>
              </Field>
            </>
          )}

          {form.kind === "empresa" && (
            <Field label="Tipo">
              <select
                className={inputClass}
                value={fTipoEmpresa}
                onChange={(e) =>
                  setFTipoEmpresa(e.target.value as TipoEmpresa)
                }
              >
                <option value="PROPIA">Propia</option>
                <option value="ALIADA">Aliada</option>
              </select>
            </Field>
          )}

          {form.kind === "camioneta" && (
            <>
              <Field label="Patente">
                <input
                  className={inputClass}
                  value={fPatente}
                  onChange={(e) => setFPatente(e.target.value)}
                  required
                />
              </Field>
              <Field label="Datos técnicos">
                <input
                  className={inputClass}
                  value={fDatosTecnicos}
                  onChange={(e) => setFDatosTecnicos(e.target.value)}
                />
              </Field>
              <Field label="Kilometraje">
                <input
                  type="number"
                  className={inputClass}
                  value={fKm}
                  onChange={(e) => setFKm(e.target.value)}
                />
              </Field>
              <Field label="Estado">
                <select
                  className={inputClass}
                  value={fEstadoCam}
                  onChange={(e) =>
                    setFEstadoCam(
                      e.target.value as
                        | "OPERATIVA"
                        | "EN_TALLER"
                        | "DE_VACACIONES"
                        | "FUERA_SERVICIO"
                    )
                  }
                >
                  <option value="OPERATIVA">Operativa</option>
                  <option value="EN_TALLER">En taller</option>
                  <option value="DE_VACACIONES">De vacaciones</option>
                  <option value="FUERA_SERVICIO">Fuera de servicio</option>
                </select>
              </Field>
              <Field label="Empresa (asignación)">
                <select
                  className={inputClass}
                  value={fEmpresaId}
                  onChange={(e) => setFEmpresaId(e.target.value)}
                >
                  <option value="">—</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Chofer (asignación)">
                <select
                  className={inputClass}
                  value={fChoferId}
                  onChange={(e) => setFChoferId(e.target.value)}
                >
                  <option value="">—</option>
                  {choferes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          {form.kind === "usuario" && (
            <>
              <Field label="Email">
                <input
                  type="email"
                  className={inputClass}
                  value={fEmail}
                  onChange={(e) => setFEmail(e.target.value)}
                  required
                />
              </Field>
              <Field
                label={
                  form.item
                    ? "Password (dejar vacío para no cambiar)"
                    : "Password"
                }
              >
                <input
                  type="password"
                  className={inputClass}
                  value={fPassword}
                  onChange={(e) => setFPassword(e.target.value)}
                  required={!form.item}
                />
              </Field>
              <Field label="Rol">
                <select
                  className={inputClass}
                  value={fRol}
                  onChange={(e) => setFRol(e.target.value as Role)}
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Estado">
                <select
                  className={inputClass}
                  value={fEstadoUser}
                  onChange={(e) =>
                    setFEstadoUser(e.target.value as "ACTIVO" | "INACTIVO")
                  }
                >
                  <option value="ACTIVO">Activo</option>
                  <option value="INACTIVO">Inactivo</option>
                </select>
              </Field>
            </>
          )}
        </FormModal>
      )}
    </div>
  );
}

function Actions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 text-xs">
      <button
        type="button"
        onClick={onEdit}
        className="text-slate-500 hover:text-slate-800"
      >
        Editar
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-red-500 hover:text-red-700"
      >
        Eliminar
      </button>
    </div>
  );
}

function EntityTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--vl-card-border)] bg-slate-50 text-xs text-[var(--vl-text-muted)] dark:bg-slate-900/50">
          <tr>
            {headers.map((h) => (
              <th key={h || "actions"} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[var(--vl-card-border)]">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-[var(--vl-text)]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={headers.length}
                className="px-4 py-8 text-center text-[var(--vl-text-muted)]"
              >
                Sin registros
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
