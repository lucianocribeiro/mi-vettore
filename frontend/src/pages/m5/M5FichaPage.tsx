import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
  Badge,
  ESTADO_CAMIONETA_STYLE,
  ESTADO_CHOFER_STYLE,
} from "../../components/Badge";
import {
  EMPTY_FLOTA_FILTERS,
  ESTADO_CAMIONETA_LABEL,
  FlotaUnitFilterBar,
  filterCamionetas,
  type FlotaUnitFilters,
} from "../../components/FlotaUnitFilterBar";
import { Download, Plus } from "../../components/icons";
import { apiDownload, apiFetch, ApiError } from "../../lib/api";
import {
  ALL_ROLES,
  ROLE_LABELS,
  canWriteMaster,
  currentAsignacion,
  isInternalOps,
  type Camioneta,
  type Cliente,
  type Chofer,
  type Empresa,
  type Role,
  type SegmentoCliente,
  type TipoEmpresa,
  type TipoServicio,
  type User,
} from "../../types";
import { FichaDrawer } from "./FichaDrawer";
import { Field, FormModal, inputClass } from "./FormModal";

type Tab =
  | "camioneta"
  | "chofer"
  | "clientes"
  | "empresas"
  | "usuarios"
  | "tiposServicio";

type DrawerOpen =
  | { tipo: "camioneta"; item: Camioneta }
  | { tipo: "chofer"; item: Chofer }
  | null;

type CreateKind =
  | "camioneta"
  | "chofer"
  | "cliente"
  | "empresa"
  | "usuario"
  | "tipoServicio";

const CREATE_KIND_BY_TAB: Record<Tab, CreateKind | null> = {
  camioneta: "camioneta",
  chofer: "chofer",
  clientes: "cliente",
  empresas: "empresa",
  usuarios: "usuario",
  tiposServicio: "tipoServicio",
};

const CREATE_LABEL_BY_TAB: Record<Tab, string> = {
  camioneta: "camioneta",
  chofer: "chofer",
  clientes: "cliente",
  empresas: "empresa",
  usuarios: "usuario",
  tiposServicio: "tipo de servicio",
};

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
  const [tiposServicio, setTiposServicio] = useState<TipoServicio[]>([]);

  const [drawer, setDrawer] = useState<DrawerOpen>(null);
  const [unitFilters, setUnitFilters] =
    useState<FlotaUnitFilters>(EMPTY_FLOTA_FILTERS);
  const [choferQuery, setChoferQuery] = useState("");
  const [exportando, setExportando] = useState(false);
  const [form, setForm] = useState<
    | null
    | { kind: "cliente"; item?: Cliente }
    | { kind: "chofer"; item?: Chofer }
    | { kind: "empresa"; item?: Empresa }
    | { kind: "camioneta"; item?: Camioneta }
    | { kind: "usuario"; item?: User }
    | { kind: "tipoServicio"; item?: TipoServicio }
  >(null);
  const [formError, setFormError] = useState<string | null>(null);

  // form drafts
  const [fNombre, setFNombre] = useState("");
  const [fContacto, setFContacto] = useState("");
  const [fSegmento, setFSegmento] = useState<SegmentoCliente>("ESTATICO");
  const [fDni, setFDni] = useState("");
  const [fCuil, setFCuil] = useState("");
  const [fLicencia, setFLicencia] = useState("");
  const [fLicenciaVenc, setFLicenciaVenc] = useState("");
  const [fTelefono, setFTelefono] = useState("");
  const [fEmailChofer, setFEmailChofer] = useState("");
  const [fEsDueno, setFEsDueno] = useState(false);
  const [fEstadoChofer, setFEstadoChofer] = useState<"ACTIVO" | "INACTIVO">(
    "ACTIVO"
  );
  const [fTipoEmpresa, setFTipoEmpresa] = useState<TipoEmpresa>("PROPIA");
  const [fCuit, setFCuit] = useState("");
  const [fContactoEmpresa, setFContactoEmpresa] = useState("");
  const [fPatente, setFPatente] = useState("");
  const [fMarca, setFMarca] = useState("");
  const [fModelo, setFModelo] = useState("");
  const [fAnio, setFAnio] = useState("");
  const [fEquipoFrio, setFEquipoFrio] = useState("");
  const [fCapacidad, setFCapacidad] = useState("");
  const [fTipoTransporte, setFTipoTransporte] = useState<string>("");
  const [fTipoServicioId, setFTipoServicioId] = useState("");
  const [fDatosTecnicos, setFDatosTecnicos] = useState("");
  const [fKm, setFKm] = useState("0");
  const [fAceite, setFAceite] = useState("");
  const [fCorrea, setFCorrea] = useState("");
  const [fNeumaticos, setFNeumaticos] = useState("");
  const [fBateria, setFBateria] = useState("");
  const [fSeguroCia, setFSeguroCia] = useState("");
  const [fSeguroVenc, setFSeguroVenc] = useState("");
  const [fVtbVenc, setFVtbVenc] = useState("");
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
  const [fTsNombre, setFTsNombre] = useState("");
  const [fTsOrden, setFTsOrden] = useState("0");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [cami, chof, cli, emp, usu, tServ] = await Promise.all([
        apiFetch<Camioneta[]>("/api/camionetas", {}, token),
        apiFetch<Chofer[]>("/api/choferes", {}, token),
        apiFetch<Cliente[]>("/api/clientes", {}, token),
        apiFetch<Empresa[]>("/api/empresas", {}, token),
        apiFetch<User[]>("/api/usuarios", {}, token),
        apiFetch<TipoServicio[]>("/api/tipos-servicio", {}, token),
      ]);
      setCamionetas(cami);
      setChoferes(chof);
      setClientes(cli);
      setEmpresas(emp);
      setUsuarios(usu);
      setTiposServicio(tServ);
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
    setFCuil("");
    setFLicencia("");
    setFLicenciaVenc("");
    setFTelefono("");
    setFEmailChofer("");
    setFEsDueno(false);
    setFEstadoChofer("ACTIVO");
    setFTipoEmpresa("PROPIA");
    setFCuit("");
    setFContactoEmpresa("");
    setFPatente("");
    setFMarca("");
    setFModelo("");
    setFAnio("");
    setFEquipoFrio("");
    setFCapacidad("");
    setFTipoTransporte("");
    setFTipoServicioId("");
    setFDatosTecnicos("");
    setFKm("0");
    setFAceite("");
    setFCorrea("");
    setFNeumaticos("");
    setFBateria("");
    setFSeguroCia("");
    setFSeguroVenc("");
    setFVtbVenc("");
    setFEstadoCam("OPERATIVA");
    setFChoferId("");
    setFEmpresaId("");
    setFEmail("");
    setFPassword("");
    setFRol("CLIENTE");
    setFEstadoUser("ACTIVO");
    setFTsNombre("");
    setFTsOrden("0");
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
    setFCuil(item.cuil ?? "");
    setFLicencia(item.licencia ?? "");
    setFLicenciaVenc(
      item.licenciaVencimiento
        ? item.licenciaVencimiento.slice(0, 10)
        : ""
    );
    setFTelefono(item.telefono ?? "");
    setFEmailChofer(item.email ?? "");
    setFEsDueno(!!item.esDuenoFlota);
    setFEstadoChofer(item.estado);
    setForm({ kind: "chofer", item });
  }

  function openEditEmpresa(item: Empresa) {
    setFormError(null);
    setFNombre(item.nombre);
    setFTipoEmpresa(item.tipo);
    setFCuit(item.cuit ?? "");
    setFContactoEmpresa(item.contacto ?? "");
    setForm({ kind: "empresa", item });
  }

  function openEditCamioneta(item: Camioneta) {
    setFormError(null);
    setFPatente(item.patente);
    setFMarca(item.marca ?? "");
    setFModelo(item.modelo ?? "");
    setFAnio(item.anio != null ? String(item.anio) : "");
    setFEquipoFrio(item.equipoFrio ?? "");
    setFCapacidad(item.capacidad ?? "");
    setFTipoTransporte(item.tipoTransporte ?? "");
    setFTipoServicioId(item.tipoServicioId ?? "");
    setFDatosTecnicos(item.datosTecnicos ?? "");
    setFKm(String(item.km));
    setFAceite(
      item.fechaUltimoAceite ? item.fechaUltimoAceite.slice(0, 10) : ""
    );
    setFCorrea(
      item.fechaCambioCorrea ? item.fechaCambioCorrea.slice(0, 10) : ""
    );
    setFNeumaticos(
      item.fechaCambioNeumaticos ? item.fechaCambioNeumaticos.slice(0, 10) : ""
    );
    setFBateria(
      item.fechaCambioBateria ? item.fechaCambioBateria.slice(0, 10) : ""
    );
    setFSeguroCia(item.seguroCompania ?? "");
    setFSeguroVenc(
      item.seguroVencimiento ? item.seguroVencimiento.slice(0, 10) : ""
    );
    setFVtbVenc(item.vtbVencimiento ? item.vtbVencimiento.slice(0, 10) : "");
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
          cuil: fCuil || null,
          licencia: fLicencia || null,
          licenciaVencimiento: fLicenciaVenc || null,
          telefono: fTelefono || null,
          email: fEmailChofer || null,
          esDuenoFlota: fEsDueno,
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
        const body = {
          nombre: fNombre,
          tipo: fTipoEmpresa,
          cuit: fCuit || null,
          contacto: fContactoEmpresa || null,
        };
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
          marca: fMarca || null,
          modelo: fModelo || null,
          anio: fAnio ? Number(fAnio) : null,
          equipoFrio: fEquipoFrio || null,
          capacidad: fCapacidad || null,
          tipoTransporte: fTipoTransporte || null,
          tipoServicioId: fTipoServicioId || null,
          datosTecnicos: fDatosTecnicos || null,
          km: Number(fKm) || 0,
          fechaUltimoAceite: fAceite || null,
          fechaCambioCorrea: fCorrea || null,
          fechaCambioNeumaticos: fNeumaticos || null,
          fechaCambioBateria: fBateria || null,
          seguroCompania: fSeguroCia || null,
          seguroVencimiento: fSeguroVenc || null,
          vtbVencimiento: fVtbVenc || null,
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
                marca: body.marca,
                modelo: body.modelo,
                anio: body.anio,
                equipoFrio: body.equipoFrio,
                capacidad: body.capacidad,
                tipoTransporte: body.tipoTransporte,
                tipoServicioId: body.tipoServicioId,
                datosTecnicos: body.datosTecnicos,
                km: body.km,
                fechaUltimoAceite: body.fechaUltimoAceite,
                fechaCambioCorrea: body.fechaCambioCorrea,
                fechaCambioNeumaticos: body.fechaCambioNeumaticos,
                fechaCambioBateria: body.fechaCambioBateria,
                seguroCompania: body.seguroCompania,
                seguroVencimiento: body.seguroVencimiento,
                vtbVencimiento: body.vtbVencimiento,
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

      if (form.kind === "tipoServicio") {
        const nombre = fTsNombre.trim();
        if (!nombre) {
          setFormError("Nombre obligatorio");
          return;
        }
        const created = await apiFetch<TipoServicio>(
          "/api/tipos-servicio",
          {
            method: "POST",
            body: JSON.stringify({ nombre, orden: Number(fTsOrden) || 0 }),
          },
          token
        );
        setTiposServicio((prev) =>
          [...prev, created].sort(
            (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)
          )
        );
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
    kind: "cliente" | "empresa" | "usuario",
    id: string
  ) {
    if (!token || !canEdit) return;
    if (!confirm("¿Eliminar este registro?")) return;
    const paths = {
      cliente: `/api/clientes/${id}`,
      empresa: `/api/empresas/${id}`,
      usuario: `/api/usuarios/${id}`,
    };
    try {
      await apiFetch(paths[kind], { method: "DELETE" }, token);
      if (kind === "cliente") setClientes((p) => p.filter((x) => x.id !== id));
      if (kind === "empresa") setEmpresas((p) => p.filter((x) => x.id !== id));
      if (kind === "usuario") setUsuarios((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
  }

  /** Baja lógica: chofer → INACTIVO (DELETE /choferes/:id), camioneta → FUERA_SERVICIO (POST /baja). */
  async function darDeBaja(tipo: "camioneta" | "chofer", id: string) {
    if (!token || !canEdit) return;
    if (
      !confirm(
        "¿Dar de baja este registro? Queda inactivo pero conserva su historial."
      )
    ) {
      return;
    }
    try {
      if (tipo === "chofer") {
        const updated = await apiFetch<Chofer>(
          `/api/choferes/${id}`,
          { method: "DELETE" },
          token
        );
        setChoferes((prev) => prev.map((x) => (x.id === id ? updated : x)));
        if (drawer?.tipo === "chofer" && drawer.item.id === id) {
          setDrawer({ tipo: "chofer", item: updated });
        }
      } else {
        const updated = await apiFetch<Camioneta>(
          `/api/camionetas/${id}/baja`,
          { method: "POST" },
          token
        );
        setCamionetas((prev) => prev.map((x) => (x.id === id ? updated : x)));
        if (drawer?.tipo === "camioneta" && drawer.item.id === id) {
          setDrawer({ tipo: "camioneta", item: updated });
        }
      }
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo dar de baja");
    }
  }

  async function toggleTipoServicio(item: TipoServicio) {
    if (!token || !canEdit) return;
    try {
      const updated = await apiFetch<TipoServicio>(
        `/api/tipos-servicio/${item.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ activo: !item.activo }),
        },
        token
      );
      setTiposServicio((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo actualizar");
    }
  }

  async function exportarExcel() {
    if (!token) return;
    setExportando(true);
    try {
      const map: Record<Tab, { url: string; file: string }> = {
        camioneta: { url: "/api/camionetas/export", file: "unidades.xlsx" },
        chofer: { url: "/api/choferes/export", file: "choferes.xlsx" },
        clientes: { url: "/api/clientes/export", file: "clientes.xlsx" },
        empresas: { url: "/api/empresas/export", file: "empresas.xlsx" },
        usuarios: { url: "/api/usuarios/export", file: "usuarios.xlsx" },
        tiposServicio: {
          url: "/api/tipos-servicio/export",
          file: "tipos_servicio.xlsx",
        },
      };
      const target = map[tab];
      await apiDownload(target.url, token, target.file);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "camioneta", label: "Vista por camioneta" },
    { id: "chofer", label: "Vista por chofer" },
    { id: "clientes", label: "Clientes" },
    { id: "empresas", label: "Empresas" },
    { id: "usuarios", label: "Usuarios" },
    { id: "tiposServicio", label: "Tipos de servicio" },
  ];

  const camionetasFiltradas = useMemo(
    () => filterCamionetas(camionetas, unitFilters),
    [camionetas, unitFilters]
  );

  const choferesFiltrados = useMemo(() => {
    const q = choferQuery.trim().toLowerCase();
    if (!q) return choferes;
    return choferes.filter((c) => {
      const hay = [
        c.nombre,
        c.dni,
        c.cuil,
        c.email,
        c.telefono,
        c.esDuenoFlota ? "empresa de transporte" : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [choferes, choferQuery]);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
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
        {isInternalOps(user?.rol) && (
          <button
            type="button"
            onClick={() => void exportarExcel()}
            disabled={exportando}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2 text-sm font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
          >
            <Download size={14} />
            {exportando ? "Exportando…" : "Exportar Excel"}
          </button>
        )}
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

      {(canEdit || tab === "camioneta") && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {canEdit && CREATE_KIND_BY_TAB[tab] && (
            <button
              type="button"
              onClick={() => openCreate(CREATE_KIND_BY_TAB[tab]!)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              <Plus size={14} />
              Nuevo {CREATE_LABEL_BY_TAB[tab]}
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
        <>
          <FlotaUnitFilterBar
            value={unitFilters}
            onChange={setUnitFilters}
            total={camionetas.length}
            shown={camionetasFiltradas.length}
          />
          {camionetasFiltradas.length === 0 ? (
            <p className="text-sm text-[var(--vl-text-muted)]">
              No hay unidades con esos filtros.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {camionetasFiltradas.map((c) => {
                const a = currentAsignacion(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setDrawer({ tipo: "camioneta", item: c })}
                    className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4 text-left transition hover:border-slate-400 hover:shadow-sm dark:hover:border-slate-500"
                  >
                    <div className="font-semibold text-[var(--vl-heading)]">
                      {c.patente}
                    </div>
                    <div className="mt-1 text-xs text-[var(--vl-text-muted)]">
                      {a?.empresa?.nombre ?? "Sin empresa"} ·{" "}
                      {a?.chofer?.nombre ?? "Sin chofer"} ·{" "}
                      {c.km.toLocaleString("es-AR")} km
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <Badge className={ESTADO_CAMIONETA_STYLE[c.estado]}>
                        {ESTADO_CAMIONETA_LABEL[c.estado]}
                      </Badge>
                      {(c.tipoServicio?.nombre || c.tipoTransporte) && (
                        <span className="text-[var(--vl-text-muted)]">
                          {c.tipoServicio?.nombre ||
                            c.tipoTransporte?.replace(/_/g, " ").toLowerCase()}
                        </span>
                      )}
                      {c.capacidad && (
                        <span className="text-[var(--vl-text-muted)]">
                          {c.capacidad}
                        </span>
                      )}
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
                      {canEdit && c.estado !== "FUERA_SERVICIO" && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            void darDeBaja("camioneta", c.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              void darDeBaja("camioneta", c.id);
                            }
                          }}
                          className="text-red-400 underline-offset-2 hover:text-red-700 hover:underline"
                        >
                          Dar de baja
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {!loading && !error && tab === "chofer" && (
        <>
          <div className="mb-4">
            <input
              type="search"
              value={choferQuery}
              onChange={(e) => setChoferQuery(e.target.value)}
              placeholder="Buscar chofer por nombre, DNI, CUIL…"
              className="min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2 text-sm text-[var(--vl-text)] outline-none focus:border-[#1e4080]"
            />
            <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
              Mostrando {choferesFiltrados.length} de {choferes.length}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {choferesFiltrados.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setDrawer({ tipo: "chofer", item: c })}
                className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4 text-left transition hover:border-slate-400 hover:shadow-sm dark:hover:border-slate-500"
              >
                <div className="font-semibold text-[var(--vl-heading)]">
                  {c.nombre}
                </div>
                <div className="mt-1 text-xs text-[var(--vl-text-muted)]">
                  DNI {c.dni}
                  {c.cuil ? ` · CUIL ${c.cuil}` : ""}
                  {c.esDuenoFlota ? " · empresa de transporte" : ""}
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
                  {canEdit && c.estado === "ACTIVO" && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        void darDeBaja("chofer", c.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          void darDeBaja("chofer", c.id);
                        }
                      }}
                      className="text-red-400 underline-offset-2 hover:text-red-700 hover:underline"
                    >
                      Dar de baja
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
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
          headers={["Nombre", "CUIT", "Contacto", "Tipo", ""]}
          rows={empresas.map((e) => [
            e.nombre,
            e.cuit || "—",
            e.contacto || "—",
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

      {!loading && !error && tab === "tiposServicio" && (
        <EntityTable
          headers={["Nombre", "Orden", "Estado", ""]}
          rows={tiposServicio.map((t) => [
            t.nombre,
            String(t.orden),
            t.activo ? "Activo" : "Inactivo",
            canEdit ? (
              <div className="flex justify-end text-xs">
                <button
                  type="button"
                  onClick={() => void toggleTipoServicio(t)}
                  className={
                    t.activo
                      ? "text-red-500 hover:text-red-700"
                      : "text-emerald-600 hover:text-emerald-800"
                  }
                >
                  {t.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
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
          onBaja={(tipo, id) => void darDeBaja(tipo, id)}
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
              ? `Editar ${form.kind === "tipoServicio" ? "tipo de servicio" : form.kind}`
              : `Nuevo ${form.kind === "tipoServicio" ? "tipo de servicio" : form.kind}`
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
              <Field label="CUIL">
                <input
                  className={inputClass}
                  value={fCuil}
                  onChange={(e) => setFCuil(e.target.value)}
                />
              </Field>
              <Field label="Licencia (categoría)">
                <input
                  className={inputClass}
                  value={fLicencia}
                  onChange={(e) => setFLicencia(e.target.value)}
                />
              </Field>
              <Field label="Vencimiento licencia">
                <input
                  type="date"
                  className={inputClass}
                  value={fLicenciaVenc}
                  onChange={(e) => setFLicenciaVenc(e.target.value)}
                />
              </Field>
              <Field label="Teléfono">
                <input
                  className={inputClass}
                  value={fTelefono}
                  onChange={(e) => setFTelefono(e.target.value)}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className={inputClass}
                  value={fEmailChofer}
                  onChange={(e) => setFEmailChofer(e.target.value)}
                />
              </Field>
              <Field label="Perfil flota">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fEsDueno}
                    onChange={(e) => setFEsDueno(e.target.checked)}
                  />
                  Empresa de transporte (ve todas las unidades)
                </label>
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
            <>
              <Field label="CUIT">
                <input
                  className={inputClass}
                  value={fCuit}
                  onChange={(e) => setFCuit(e.target.value)}
                />
              </Field>
              <Field label="Mail contacto">
                <input
                  type="email"
                  className={inputClass}
                  value={fContactoEmpresa}
                  onChange={(e) => setFContactoEmpresa(e.target.value)}
                />
              </Field>
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
            </>
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
              <Field label="Marca">
                <select
                  className={inputClass}
                  value={fMarca}
                  onChange={(e) => setFMarca(e.target.value)}
                >
                  <option value="">—</option>
                  {[
                    "Renault",
                    "Peugeot",
                    "Fiat",
                    "Volkswagen",
                    "Ford",
                    "Chevrolet",
                    "Mercedes-Benz",
                    "Iveco",
                    "Otra",
                  ].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Modelo">
                <input
                  className={inputClass}
                  value={fModelo}
                  onChange={(e) => setFModelo(e.target.value)}
                />
              </Field>
              <Field label="Año">
                <select
                  className={inputClass}
                  value={fAnio}
                  onChange={(e) => setFAnio(e.target.value)}
                >
                  <option value="">—</option>
                  {Array.from({ length: 20 }, (_, i) => 2026 - i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Equipo de frío">
                <input
                  className={inputClass}
                  value={fEquipoFrio}
                  onChange={(e) => setFEquipoFrio(e.target.value)}
                  placeholder="Ej: Carrier Xarios 600"
                />
              </Field>
              <Field label="Capacidad">
                <input
                  className={inputClass}
                  value={fCapacidad}
                  onChange={(e) => setFCapacidad(e.target.value)}
                  placeholder="Ej: 3500 kg"
                />
              </Field>
              <Field label="Tipo de servicio">
                <select
                  className={inputClass}
                  value={fTipoServicioId}
                  onChange={(e) => setFTipoServicioId(e.target.value)}
                >
                  <option value="">—</option>
                  {tiposServicio
                    .filter((t) => t.activo || t.id === fTipoServicioId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                        {!t.activo ? " (inactivo)" : ""}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Clasificación (legado)">
                <select
                  className={inputClass}
                  value={fTipoTransporte}
                  onChange={(e) => setFTipoTransporte(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="CONGELADO">Congelado</option>
                  <option value="SUPERCONGELADO">Supercongelado</option>
                  <option value="REFRIGERADO">Refrigerado</option>
                  <option value="SECO">Seco</option>
                </select>
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
              <Field label="Último cambio de aceite">
                <input
                  type="date"
                  className={inputClass}
                  value={fAceite}
                  onChange={(e) => setFAceite(e.target.value)}
                />
              </Field>
              <Field label="Último cambio de correa">
                <input
                  type="date"
                  className={inputClass}
                  value={fCorrea}
                  onChange={(e) => setFCorrea(e.target.value)}
                />
              </Field>
              <Field label="Último cambio de neumáticos">
                <input
                  type="date"
                  className={inputClass}
                  value={fNeumaticos}
                  onChange={(e) => setFNeumaticos(e.target.value)}
                />
              </Field>
              <Field label="Último cambio de batería">
                <input
                  type="date"
                  className={inputClass}
                  value={fBateria}
                  onChange={(e) => setFBateria(e.target.value)}
                />
              </Field>
              <Field label="Compañía de seguro">
                <input
                  className={inputClass}
                  value={fSeguroCia}
                  onChange={(e) => setFSeguroCia(e.target.value)}
                />
              </Field>
              <Field label="Vencimiento seguro">
                <input
                  type="date"
                  className={inputClass}
                  value={fSeguroVenc}
                  onChange={(e) => setFSeguroVenc(e.target.value)}
                />
              </Field>
              <Field label="Vencimiento VTV">
                <input
                  type="date"
                  className={inputClass}
                  value={fVtbVenc}
                  onChange={(e) => setFVtbVenc(e.target.value)}
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
                      {c.esDuenoFlota ? " (empresa transp.)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          {form.kind === "tipoServicio" && (
            <>
              <Field label="Nombre">
                <input
                  className={inputClass}
                  value={fTsNombre}
                  onChange={(e) => setFTsNombre(e.target.value)}
                  required
                />
              </Field>
              <Field label="Orden">
                <input
                  type="number"
                  className={inputClass}
                  value={fTsOrden}
                  onChange={(e) => setFTsOrden(e.target.value)}
                />
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
