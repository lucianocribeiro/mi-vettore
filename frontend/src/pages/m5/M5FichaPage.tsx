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
  EQUIPO_FRIO_MARCAS,
  MARCAS_CAMIONETA,
  MARCA_MODELO_CAMIONETA,
  ROLE_LABELS,
  TIPO_TALLER_LABEL,
  canWriteMaster,
  currentAsignacion,
  isInternalOps,
  tiposFrioParaEquipo,
  type Camioneta,
  type Chofer,
  type Empresa,
  type MarcaCamioneta,
  type Role,
  type TallerProveedor,
  type TipoEmpresa,
  type TipoServicio,
  type TipoTaller,
  type User,
} from "../../types";
import { FichaDrawer } from "./FichaDrawer";
import { Field, FormModal, inputClass } from "./FormModal";

type Tab =
  | "camioneta"
  | "chofer"
  | "empresas"
  | "usuarios"
  | "tiposServicio"
  | "talleres"
  | "asignacion";

type DrawerOpen =
  | { tipo: "camioneta"; item: Camioneta }
  | { tipo: "chofer"; item: Chofer }
  | null;

type CreateKind =
  | "camioneta"
  | "chofer"
  | "empresa"
  | "usuario"
  | "tipoServicio"
  | "taller";

const CREATE_KIND_BY_TAB: Record<Tab, CreateKind | null> = {
  camioneta: "camioneta",
  chofer: "chofer",
  empresas: "empresa",
  usuarios: "usuario",
  tiposServicio: "tipoServicio",
  talleres: "taller",
  asignacion: null,
};

const CREATE_LABEL_BY_TAB: Record<Tab, string> = {
  camioneta: "camioneta",
  chofer: "chofer",
  empresas: "empresa",
  usuarios: "usuario",
  tiposServicio: "tipo de servicio",
  talleres: "taller",
  asignacion: "",
};

const ANIO_MIN = 2000; // piso desde 2000 inclusive; planilla decía >2005
const ANIO_MAX = new Date().getFullYear();

/** Digits for wa.me; null if not usable as phone. */
function whatsappDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = `54${digits.slice(1)}`;
  if (digits.length < 8) return null;
  return digits;
}

export function M5FichaPage() {
  const { token, user } = useAuth();
  const canEdit = canWriteMaster(user?.rol);

  const [tab, setTab] = useState<Tab>("camioneta");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [camionetas, setCamionetas] = useState<Camioneta[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [tiposServicio, setTiposServicio] = useState<TipoServicio[]>([]);
  const [talleres, setTalleres] = useState<TallerProveedor[]>([]);
  const [tiposTallerMeta, setTiposTallerMeta] = useState<TipoTaller[]>([]);

  const [drawer, setDrawer] = useState<DrawerOpen>(null);
  const [unitFilters, setUnitFilters] =
    useState<FlotaUnitFilters>(EMPTY_FLOTA_FILTERS);
  const [choferQuery, setChoferQuery] = useState("");
  const [exportando, setExportando] = useState(false);
  const [form, setForm] = useState<
    | null
    | { kind: "chofer"; item?: Chofer }
    | { kind: "empresa"; item?: Empresa }
    | { kind: "camioneta"; item?: Camioneta }
    | { kind: "usuario"; item?: User }
    | { kind: "tipoServicio"; item?: TipoServicio }
    | { kind: "taller"; item?: TallerProveedor }
  >(null);
  const [formError, setFormError] = useState<string | null>(null);

  // form drafts
  const [fNombre, setFNombre] = useState("");
  const [fDni, setFDni] = useState("");
  const [fCuil, setFCuil] = useState("");
  const [fLicencia, setFLicencia] = useState("");
  const [fLicenciaVenc, setFLicenciaVenc] = useState("");
  const [fTelefono, setFTelefono] = useState("");
  const [fEmailChofer, setFEmailChofer] = useState("");
  const [fEsDueno, setFEsDueno] = useState(false);
  const [fVerMant, setFVerMant] = useState(true);
  const [fVerTaller, setFVerTaller] = useState(true);
  const [fEstadoChofer, setFEstadoChofer] = useState<"ACTIVO" | "INACTIVO">(
    "ACTIVO"
  );
  const [fTipoEmpresa, setFTipoEmpresa] = useState<TipoEmpresa>("PROPIA");
  const [fCuit, setFCuit] = useState("");
  const [fContactoEmpresa, setFContactoEmpresa] = useState("");
  const [fPermiteMultiCamioneta, setFPermiteMultiCamioneta] = useState(false);
  const [fPatente, setFPatente] = useState("");
  const [fMarca, setFMarca] = useState("");
  const [fModelo, setFModelo] = useState("");
  const [fAnio, setFAnio] = useState("");
  const [fEquipoFrio, setFEquipoFrio] = useState("");
  const [fCapacidadValor, setFCapacidadValor] = useState("");
  const [fCapacidadUnidad, setFCapacidadUnidad] = useState("");
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
  const [fEmpresaId, setFEmpresaId] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fRol, setFRol] = useState<Role>("CHOFER");
  const [fEstadoUser, setFEstadoUser] = useState<"ACTIVO" | "INACTIVO">(
    "ACTIVO"
  );
  const [fTsNombre, setFTsNombre] = useState("");
  const [fTsOrden, setFTsOrden] = useState("0");
  const [fTallerCuit, setFTallerCuit] = useState("");
  const [fTallerRazon, setFTallerRazon] = useState("");
  const [fTallerDireccion, setFTallerDireccion] = useState("");
  const [fTallerMail, setFTallerMail] = useState("");
  const [fTallerCelular, setFTallerCelular] = useState("");
  const [fTallerWhatsapp, setFTallerWhatsapp] = useState(false);
  const [fTallerAlias, setFTallerAlias] = useState("");
  const [fTallerTipos, setFTallerTipos] = useState<TipoTaller[]>([]);
  const [asigEmpresaId, setAsigEmpresaId] = useState("");
  const [asigChoferByUnit, setAsigChoferByUnit] = useState<
    Record<string, string>
  >({});
  const [asigSavingId, setAsigSavingId] = useState<string | null>(null);
  const [asigError, setAsigError] = useState<string | null>(null);

  const modelosParaMarca = useMemo(() => {
    if (!fMarca || !(fMarca in MARCA_MODELO_CAMIONETA)) return [] as string[];
    return [...MARCA_MODELO_CAMIONETA[fMarca as MarcaCamioneta]];
  }, [fMarca]);

  const tiposFrioPermitidos = useMemo(
    () => tiposFrioParaEquipo(fEquipoFrio),
    [fEquipoFrio]
  );

  const tiposServicioParaEquipo = useMemo(() => {
    const activos = tiposServicio.filter(
      (t) => t.activo || t.id === fTipoServicioId
    );
    if (!tiposFrioPermitidos) return activos;
    const allowed = new Set(
      tiposFrioPermitidos.map((n) => n.toLowerCase())
    );
    const filtered = activos.filter((t) =>
      allowed.has(t.nombre.trim().toLowerCase())
    );
    // Conservar selección actual si quedó fuera del catálogo (datos viejos).
    const current = activos.find((t) => t.id === fTipoServicioId);
    if (
      current &&
      !filtered.some((t) => t.id === current.id)
    ) {
      return [...filtered, current];
    }
    return filtered;
  }, [tiposServicio, tiposFrioPermitidos, fTipoServicioId]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [cami, chof, emp, usu, tServ, tall, tallMeta] =
        await Promise.all([
          apiFetch<Camioneta[]>("/api/camionetas", {}, token),
          apiFetch<Chofer[]>("/api/choferes", {}, token),
          apiFetch<Empresa[]>("/api/empresas", {}, token),
          apiFetch<User[]>("/api/usuarios", {}, token),
          apiFetch<TipoServicio[]>("/api/tipos-servicio", {}, token),
          apiFetch<TallerProveedor[]>("/api/talleres-proveedores", {}, token),
          apiFetch<{ tipos: TipoTaller[] }>(
            "/api/talleres-proveedores/meta",
            {},
            token
          ).catch(() => ({ tipos: Object.keys(TIPO_TALLER_LABEL) as TipoTaller[] })),
        ]);
      setCamionetas(cami);
      setChoferes(chof);
      setEmpresas(emp);
      setUsuarios(usu);
      setTiposServicio(tServ);
      setTalleres(tall);
      setTiposTallerMeta(
        tallMeta.tipos?.length
          ? tallMeta.tipos
          : (Object.keys(TIPO_TALLER_LABEL) as TipoTaller[])
      );
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
    setFDni("");
    setFCuil("");
    setFLicencia("");
    setFLicenciaVenc("");
    setFTelefono("");
    setFEmailChofer("");
    setFEsDueno(false);
    setFVerMant(true);
    setFVerTaller(true);
    setFEstadoChofer("ACTIVO");
    setFTipoEmpresa("PROPIA");
    setFCuit("");
    setFContactoEmpresa("");
    setFPermiteMultiCamioneta(false);
    setFPatente("");
    setFMarca("");
    setFModelo("");
    setFAnio("");
    setFEquipoFrio("");
    setFCapacidadValor("");
    setFCapacidadUnidad("");
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
    setFEmpresaId("");
    setFEmail("");
    setFPassword("");
    setFRol("CHOFER");
    setFEstadoUser("ACTIVO");
    setFTsNombre("");
    setFTsOrden("0");
    setFTallerCuit("");
    setFTallerRazon("");
    setFTallerDireccion("");
    setFTallerMail("");
    setFTallerCelular("");
    setFTallerWhatsapp(false);
    setFTallerAlias("");
    setFTallerTipos([]);
    setForm({ kind });
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
    setFVerMant(item.verMantenimiento !== false);
    setFVerTaller(item.verTaller !== false);
    setFEstadoChofer(item.estado);
    setForm({ kind: "chofer", item });
  }

  function openEditEmpresa(item: Empresa) {
    setFormError(null);
    setFNombre(item.nombre);
    setFTipoEmpresa(item.tipo);
    setFCuit(item.cuit ?? "");
    setFContactoEmpresa(item.contacto ?? "");
    setFPermiteMultiCamioneta(!!item.permiteMultiCamioneta);
    setForm({ kind: "empresa", item });
  }

  function openEditCamioneta(item: Camioneta) {
    setFormError(null);
    setFPatente(item.patente);
    setFMarca(item.marca ?? "");
    setFModelo(item.modelo ?? "");
    setFAnio(item.anio != null ? String(item.anio) : "");
    setFEquipoFrio(item.equipoFrio ?? "");
    setFCapacidadValor(
      item.capacidadValor != null ? String(item.capacidadValor) : ""
    );
    setFCapacidadUnidad(item.capacidadUnidad ?? "");
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
    setFEmpresaId(item.empresaId ?? currentAsignacion(item)?.empresaId ?? "");
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
          verMantenimiento: fVerMant,
          verTaller: fVerTaller,
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
          permiteMultiCamioneta: fPermiteMultiCamioneta,
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
          capacidadValor: fCapacidadValor ? Number(fCapacidadValor) : null,
          capacidadUnidad: fCapacidadUnidad || null,
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
          empresaId: fEmpresaId || null,
        };
        if (form.item) {
          const updated = await apiFetch<Camioneta>(
            `/api/camionetas/${form.item.id}`,
            {
              method: "PUT",
              body: JSON.stringify(body),
            },
            token
          );
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

      if (form.kind === "taller") {
        if (!fTallerCuit.trim() || !fTallerRazon.trim()) {
          setFormError("CUIT y razón social son obligatorios");
          return;
        }
        const body = {
          cuit: fTallerCuit,
          razonSocial: fTallerRazon,
          direccion: fTallerDireccion || null,
          mail: fTallerMail || null,
          celular: fTallerCelular || null,
          whatsapp: fTallerWhatsapp,
          aliasCbu: fTallerAlias || null,
          tipos: fTallerTipos,
        };
        if (form.item) {
          const updated = await apiFetch<TallerProveedor>(
            `/api/talleres-proveedores/${form.item.id}`,
            { method: "PUT", body: JSON.stringify(body) },
            token
          );
          setTalleres((prev) =>
            prev.map((t) => (t.id === updated.id ? updated : t))
          );
        } else {
          const created = await apiFetch<TallerProveedor>(
            "/api/talleres-proveedores",
            { method: "POST", body: JSON.stringify(body) },
            token
          );
          setTalleres((prev) =>
            [...prev, created].sort((a, b) =>
              a.razonSocial.localeCompare(b.razonSocial)
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

  async function deleteEntity(kind: "empresa" | "usuario", id: string) {
    if (!token || !canEdit) return;
    if (!confirm("¿Eliminar este registro?")) return;
    const paths = {
      empresa: `/api/empresas/${id}`,
      usuario: `/api/usuarios/${id}`,
    };
    try {
      await apiFetch(paths[kind], { method: "DELETE" }, token);
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
      const map: Record<Tab, { url: string; file: string } | null> = {
        camioneta: { url: "/api/camionetas/export", file: "unidades.xlsx" },
        chofer: { url: "/api/choferes/export", file: "choferes.xlsx" },
        empresas: { url: "/api/empresas/export", file: "empresas.xlsx" },
        usuarios: { url: "/api/usuarios/export", file: "usuarios.xlsx" },
        tiposServicio: {
          url: "/api/tipos-servicio/export",
          file: "tipos_servicio.xlsx",
        },
        talleres: {
          url: "/api/talleres-proveedores",
          file: "talleres.json",
        },
        asignacion: null,
      };
      if (tab === "talleres") {
        alert("Export Excel de talleres proveedores: próximamente");
        return;
      }
      const target = map[tab];
      if (!target) return;
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
    { id: "asignacion", label: "Asignación flota" },
    { id: "empresas", label: "Empresas" },
    { id: "usuarios", label: "Usuarios" },
    { id: "tiposServicio", label: "Tipos de servicio" },
  ];

  const camionetasFiltradas = useMemo(
    () => filterCamionetas(camionetas, unitFilters),
    [camionetas, unitFilters]
  );

  const unidadesDeEmpresaAsig = useMemo(() => {
    if (!asigEmpresaId) return [] as Camioneta[];
    return camionetas
      .filter((c) => {
        if (c.empresaId === asigEmpresaId) return true;
        const a = currentAsignacion(c);
        return a?.empresaId === asigEmpresaId;
      })
      .sort((a, b) => a.patente.localeCompare(b.patente));
  }, [camionetas, asigEmpresaId]);

  useEffect(() => {
    if (!asigEmpresaId) {
      setAsigChoferByUnit({});
      return;
    }
    const next: Record<string, string> = {};
    for (const c of unidadesDeEmpresaAsig) {
      const a = currentAsignacion(c);
      next[c.id] = a?.choferId ?? "";
    }
    setAsigChoferByUnit(next);
  }, [asigEmpresaId, unidadesDeEmpresaAsig]);

  async function guardarAsignacionUnidad(camionetaId: string) {
    if (!token || !asigEmpresaId) return;
    const choferId = asigChoferByUnit[camionetaId];
    if (!choferId) {
      setAsigError("Elegí un chofer para guardar la asignación");
      return;
    }
    setAsigSavingId(camionetaId);
    setAsigError(null);
    try {
      const updated = await apiFetch<Camioneta>(
        `/api/camionetas/${camionetaId}/asignacion`,
        {
          method: "POST",
          body: JSON.stringify({ choferId, empresaId: asigEmpresaId }),
        },
        token
      );
      setCamionetas((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
    } catch (err) {
      setAsigError(
        err instanceof ApiError ? err.message : "No se pudo guardar la asignación"
      );
    } finally {
      setAsigSavingId(null);
    }
  }

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
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
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
            hideDetalleUnidad
            empresas={empresas.map((e) => ({ id: e.id, nombre: e.nombre }))}
            unidades={camionetas}
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
                    <div className="text-xs text-[var(--vl-text-muted)]">
                      {c.empresa?.nombre ??
                        a?.empresa?.nombre ??
                        "Sin empresa"}{" "}
                      · {a?.chofer?.nombre ?? "Sin chofer"} ·{" "}
                      {c.km.toLocaleString("es-AR")} km
                    </div>
                    <div className="mt-2 font-semibold text-[var(--vl-heading)]">
                      {c.patente}
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
                  {whatsappDigits(c.telefono) && (
                    <a
                      href={`https://wa.me/${whatsappDigits(c.telefono)}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                    >
                      WhatsApp
                    </a>
                  )}
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

      {!loading && !error && tab === "asignacion" && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--vl-text-muted)]">
            Elegí la empresa, asigná un chofer a cada unidad y guardá. La
            propiedad de la unidad se define en el ABM de camioneta.
          </p>
          <label className="block max-w-md text-xs text-[var(--vl-text-muted)]">
            Empresa de transporte
            <select
              className={`${inputClass} mt-1`}
              value={asigEmpresaId}
              onChange={(e) => setAsigEmpresaId(e.target.value)}
            >
              <option value="">Elegí una empresa…</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
          {asigError && (
            <p className="text-sm text-red-600">{asigError}</p>
          )}
          {!asigEmpresaId ? (
            <p className="text-sm text-[var(--vl-text-muted)]">
              Seleccioná una empresa para ver sus unidades.
            </p>
          ) : unidadesDeEmpresaAsig.length === 0 ? (
            <p className="text-sm text-[var(--vl-text-muted)]">
              Esta empresa no tiene unidades (por ownership ni asignación
              abierta).
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--vl-card-border)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--vl-page)] text-xs text-[var(--vl-text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Patente</th>
                    <th className="px-3 py-2">Chofer actual</th>
                    <th className="px-3 py-2">Asignar chofer</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {unidadesDeEmpresaAsig.map((c) => {
                    const a = currentAsignacion(c);
                    return (
                      <tr
                        key={c.id}
                        className="border-t border-[var(--vl-card-border)]"
                      >
                        <td className="px-3 py-2 font-medium">{c.patente}</td>
                        <td className="px-3 py-2 text-[var(--vl-text-muted)]">
                          {a?.chofer?.nombre ?? "Sin chofer"}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className={inputClass}
                            value={asigChoferByUnit[c.id] ?? ""}
                            onChange={(e) =>
                              setAsigChoferByUnit((prev) => ({
                                ...prev,
                                [c.id]: e.target.value,
                              }))
                            }
                            disabled={!canEdit}
                          >
                            <option value="">—</option>
                            {choferes
                              .filter((ch) => ch.estado === "ACTIVO")
                              .map((ch) => (
                                <option key={ch.id} value={ch.id}>
                                  {ch.nombre}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canEdit && (
                            <button
                              type="button"
                              disabled={
                                !asigChoferByUnit[c.id] ||
                                asigSavingId === c.id ||
                                a?.choferId === asigChoferByUnit[c.id]
                              }
                              onClick={() => void guardarAsignacionUnidad(c.id)}
                              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
                            >
                              {asigSavingId === c.id ? "Guardando…" : "Guardar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && !error && tab === "empresas" && (
        <EntityTable
          headers={["Nombre", "CUIT", "Contacto", "Tipo", ""]}
          rows={empresas.map((e) => {
            const wa = whatsappDigits(e.contacto);
            return [
              e.nombre,
              e.cuit || "—",
              e.contacto || "—",
              e.tipo.toLowerCase(),
              <div key={e.id} className="flex flex-wrap items-center justify-end gap-2 text-xs">
                {wa && (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                  >
                    WhatsApp
                  </a>
                )}
                {canEdit ? (
                  <Actions
                    onEdit={() => openEditEmpresa(e)}
                    onDelete={() => void deleteEntity("empresa", e.id)}
                  />
                ) : null}
              </div>,
            ];
          })}
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

      {!loading && !error && tab === "talleres" && (
        <EntityTable
          headers={["CUIT", "Razón social", "Tipos", "Mail", "Celular", ""]}
          rows={talleres.map((t) => [
            t.cuit,
            t.razonSocial,
            (t.tipos ?? []).map((x) => x.tipo).join(", ") || "—",
            t.mail ?? "—",
            t.celular ?? "—",
            canEdit ? (
              <div className="flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  className="text-slate-600 hover:underline"
                  onClick={() => {
                    setFormError(null);
                    setFTallerCuit(t.cuit);
                    setFTallerRazon(t.razonSocial);
                    setFTallerDireccion(t.direccion ?? "");
                    setFTallerMail(t.mail ?? "");
                    setFTallerCelular(t.celular ?? "");
                    setFTallerWhatsapp(!!t.whatsapp);
                    setFTallerAlias(t.aliasCbu ?? "");
                    setFTallerTipos((t.tipos ?? []).map((x) => x.tipo));
                    setForm({ kind: "taller", item: t });
                  }}
                >
                  Editar
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
          {(form.kind === "chofer" ||
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
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fVerMant}
                    onChange={(e) => setFVerMant(e.target.checked)}
                  />
                  Módulo Mantenimiento
                </label>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fVerTaller}
                    onChange={(e) => setFVerTaller(e.target.checked)}
                  />
                  Módulo Taller
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
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={fPermiteMultiCamioneta}
                  onChange={(e) => setFPermiteMultiCamioneta(e.target.checked)}
                />
                Permitir varias camionetas por chofer en esta empresa
              </label>
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
                  onChange={(e) => {
                    setFMarca(e.target.value);
                    setFModelo("");
                  }}
                >
                  <option value="">—</option>
                  {MARCAS_CAMIONETA.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Modelo">
                <select
                  className={inputClass}
                  value={fModelo}
                  onChange={(e) => setFModelo(e.target.value)}
                >
                  <option value="">
                    {fMarca ? "—" : "Primero elegí una marca"}
                  </option>
                  {modelosParaMarca.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {!fMarca && (
                  <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
                    El modelo se completa según la marca elegida.
                  </p>
                )}
              </Field>
              <Field label="Año">
                {/* Piso desde 2000 inclusive hasta el año actual */}
                <select
                  className={inputClass}
                  value={fAnio}
                  onChange={(e) => setFAnio(e.target.value)}
                >
                  <option value="">—</option>
                  {Array.from(
                    { length: ANIO_MAX - ANIO_MIN + 1 },
                    (_, i) => ANIO_MAX - i
                  ).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Equipo de frío">
                <select
                  className={inputClass}
                  value={fEquipoFrio}
                  onChange={(e) => {
                    const next = e.target.value;
                    setFEquipoFrio(next);
                    const permitidos = tiposFrioParaEquipo(next);
                    if (!permitidos) {
                      return;
                    }
                    const allowed = new Set(
                      permitidos.map((n) => n.toLowerCase())
                    );
                    const current = tiposServicio.find(
                      (t) => t.id === fTipoServicioId
                    );
                    if (
                      current &&
                      allowed.has(current.nombre.trim().toLowerCase())
                    ) {
                      return;
                    }
                    if (permitidos.length === 1) {
                      const auto = tiposServicio.find(
                        (t) =>
                          t.activo &&
                          t.nombre.trim().toLowerCase() ===
                            permitidos[0].toLowerCase()
                      );
                      setFTipoServicioId(auto?.id ?? "");
                    } else {
                      setFTipoServicioId("");
                    }
                  }}
                >
                  <option value="">—</option>
                  {EQUIPO_FRIO_MARCAS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  {fEquipoFrio &&
                    !(EQUIPO_FRIO_MARCAS as readonly string[]).includes(
                      fEquipoFrio
                    ) && (
                      <option value={fEquipoFrio}>{fEquipoFrio}</option>
                    )}
                </select>
              </Field>
              <Field label="Capacidad (número)">
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={fCapacidadValor}
                  onChange={(e) => setFCapacidadValor(e.target.value)}
                  placeholder="Ej: 3500"
                />
              </Field>
              <Field label="Unidad de capacidad">
                <input
                  className={inputClass}
                  value={fCapacidadUnidad}
                  onChange={(e) => setFCapacidadUnidad(e.target.value)}
                  placeholder="kilos, litros, canastos…"
                />
              </Field>
              <Field label="Tipo de frío">
                <select
                  className={inputClass}
                  value={fTipoServicioId}
                  onChange={(e) => setFTipoServicioId(e.target.value)}
                  disabled={!!fEquipoFrio && tiposServicioParaEquipo.length === 0}
                >
                  <option value="">—</option>
                  {tiposServicioParaEquipo.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                      {!t.activo ? " (inactivo)" : ""}
                      {tiposFrioPermitidos &&
                      !tiposFrioPermitidos.some(
                        (n) =>
                          n.toLowerCase() === t.nombre.trim().toLowerCase()
                      )
                        ? " (fuera de catálogo)"
                        : ""}
                    </option>
                  ))}
                </select>
                {fEquipoFrio && tiposFrioPermitidos && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Para {fEquipoFrio}: {tiposFrioPermitidos.join(", ")}
                  </p>
                )}
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
              <Field label="Último cambio de distribución">
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
              <Field label="Empresa de transporte (propietaria)">
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

          {form.kind === "taller" && (
            <>
              <Field label="CUIT">
                <input
                  className={inputClass}
                  value={fTallerCuit}
                  onChange={(e) => setFTallerCuit(e.target.value)}
                  required
                />
              </Field>
              <Field label="Razón social">
                <input
                  className={inputClass}
                  value={fTallerRazon}
                  onChange={(e) => setFTallerRazon(e.target.value)}
                  required
                />
              </Field>
              <Field label="Dirección">
                <input
                  className={inputClass}
                  value={fTallerDireccion}
                  onChange={(e) => setFTallerDireccion(e.target.value)}
                />
              </Field>
              <Field label="Mail">
                <input
                  type="email"
                  className={inputClass}
                  value={fTallerMail}
                  onChange={(e) => setFTallerMail(e.target.value)}
                />
              </Field>
              <Field label="Celular">
                <input
                  className={inputClass}
                  value={fTallerCelular}
                  onChange={(e) => setFTallerCelular(e.target.value)}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={fTallerWhatsapp}
                  onChange={(e) => setFTallerWhatsapp(e.target.checked)}
                />
                WhatsApp
              </label>
              <Field label="Alias / CBU">
                <input
                  className={inputClass}
                  value={fTallerAlias}
                  onChange={(e) => setFTallerAlias(e.target.value)}
                />
              </Field>
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-[var(--vl-text-muted)]">
                  Tipos de taller (múltiples)
                </legend>
                <div className="flex flex-wrap gap-2">
                  {(tiposTallerMeta.length
                    ? tiposTallerMeta
                    : ([
                        "MECANICA",
                        "REPUESTEROS",
                        "GOMERIAS",
                        "BATERIAS",
                        "GNC",
                        "FRIO",
                      ] as TipoTaller[])
                  ).map((tipo) => {
                    const on = fTallerTipos.includes(tipo);
                    return (
                      <label
                        key={tipo}
                        className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${
                          on
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-[var(--vl-card-border)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={on}
                          onChange={() =>
                            setFTallerTipos((prev) =>
                              on
                                ? prev.filter((t) => t !== tipo)
                                : [...prev, tipo]
                            )
                          }
                        />
                        {tipo}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
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
                  {ALL_ROLES.filter((r) => r !== "CLIENTE" || form.item?.rol === "CLIENTE").map(
                    (r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    )
                  )}
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
