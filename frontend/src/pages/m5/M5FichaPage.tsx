import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
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
  EQUIPO_FRIO_MARCAS,
  ROLE_LABELS,
  TIPO_TALLER_LABEL,
  canWriteMaster,
  currentAsignacion,
  currentAsignaciones,
  formatDate,
  isInternalOps,
  tiposFrioParaEquipo,
  type Camioneta,
  type Chofer,
  type Empresa,
  type Role,
  type TallerProveedor,
  type TipoServicio,
  type TipoTaller,
  type User,
} from "../../types";
import { FichaDrawer } from "./FichaDrawer";
import { Field, FormModal, inputClass } from "./FormModal";
import { NoticeDialog } from "../../components/NoticeDialog";
import { EquiposFrioAbmPanel } from "./EquiposFrioAbmPanel";
import {
  MarcasModelosAbmPanel,
  type MarcaCamionetaAbm,
} from "./MarcasModelosAbmPanel";

type Tab =
  | "camioneta"
  | "chofer"
  | "empresas"
  | "usuarios"
  | "tiposServicio"
  | "marcasModelos"
  | "equiposFrio"
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
  marcasModelos: null,
  equiposFrio: null,
  talleres: "taller",
  asignacion: null,
};

const CREATE_LABEL_BY_TAB: Record<Tab, string> = {
  camioneta: "unidad",
  chofer: "chofer",
  empresas: "empresa",
  usuarios: "usuario especial",
  tiposServicio: "tipo de servicio",
  marcasModelos: "",
  equiposFrio: "equipo de frío",
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
  const location = useLocation();
  const vistaUsuarios = location.pathname.startsWith("/m5/usuarios");
  const canEdit = canWriteMaster(user?.rol);
  const canAssign = canEdit || user?.rol === "EMPRESA";

  const [tab, setTab] = useState<Tab>(vistaUsuarios ? "usuarios" : "empresas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [camionetas, setCamionetas] = useState<Camioneta[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [tiposServicio, setTiposServicio] = useState<TipoServicio[]>([]);
  const [marcasCamioneta, setMarcasCamioneta] = useState<MarcaCamionetaAbm[]>(
    []
  );
  const [talleres, setTalleres] = useState<TallerProveedor[]>([]);
  const [tiposTallerMeta, setTiposTallerMeta] = useState<TipoTaller[]>([]);

  const [drawer, setDrawer] = useState<DrawerOpen>(null);
  const [unitFilters, setUnitFilters] =
    useState<FlotaUnitFilters>(EMPTY_FLOTA_FILTERS);
  const [choferQuery, setChoferQuery] = useState("");
  const [choferEstadoFiltro, setChoferEstadoFiltro] = useState<
    "ACTIVO" | "INACTIVO" | "TODOS"
  >("ACTIVO");
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
  const [fLicenciaVenc, setFLicenciaVenc] = useState("");
  const [fTelefono, setFTelefono] = useState("");
  const [fEmailChofer, setFEmailChofer] = useState("");
  const [fEsDueno, setFEsDueno] = useState(false);
  const [fVerMant, setFVerMant] = useState(true);
  const [fVerTaller, setFVerTaller] = useState(true);
  const [fEstadoChofer, setFEstadoChofer] = useState<"ACTIVO" | "INACTIVO">(
    "ACTIVO"
  );
  const [fApellido, setFApellido] = useState("");
  const [fChoferEmpresaId, setFChoferEmpresaId] = useState("");
  const [fPasswordEmpresa, setFPasswordEmpresa] = useState("");
  const [fCedulaFoto, setFCedulaFoto] = useState("");
  const [fCuit, setFCuit] = useState("");
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
    "OPERATIVA" | "EN_TALLER" | "DE_VACACIONES" | "FUERA_SERVICIO" | "INACTIVA"
  >("OPERATIVA");
  const [fEstadoDesde, setFEstadoDesde] = useState("");
  const [fEstadoHasta, setFEstadoHasta] = useState("");
  const [fEmpresaId, setFEmpresaId] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fRol, setFRol] = useState<Role>("OPERACIONES");
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
    Record<string, string[]>
  >({});
  const [asigSavingId, setAsigSavingId] = useState<string | null>(null);
  const [asigError, setAsigError] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userEmpresaId, setUserEmpresaId] = useState("");
  const [userRol, setUserRol] = useState<"" | Role>("");
  const [userAdvOpen, setUserAdvOpen] = useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    message?: string;
    highlight?: string;
    variant?: "info" | "success" | "danger" | "confirm";
    confirmLabel?: string;
    onConfirm?: () => void;
  } | null>(null);

  function showNotice(n: NonNullable<typeof notice>) {
    setNotice(n);
  }

  function showErrorNotice(message: string) {
    setNotice({
      title: "No se pudo completar",
      message,
      variant: "danger",
      confirmLabel: "Entendido",
    });
  }

  function showPasswordNotice(password: string, title = "Contraseña temporal") {
    setNotice({
      title,
      message:
        "Copiala ahora: se muestra una sola vez. En el próximo ingreso el usuario deberá cambiarla.",
      highlight: password,
      variant: "success",
      confirmLabel: "Listo",
    });
  }

  const modelosParaMarca = useMemo(() => {
    if (!fMarca) return [] as string[];
    const marca = marcasCamioneta.find((m) => m.nombre === fMarca);
    if (!marca) return fModelo ? [fModelo] : [];
    const list = marca.modelos
      .filter((m) => m.activo || m.nombre === fModelo)
      .map((m) => m.nombre);
    if (fModelo && !list.includes(fModelo)) return [...list, fModelo];
    return list;
  }, [fMarca, fModelo, marcasCamioneta]);

  const marcasActivas = useMemo(() => {
    const list = marcasCamioneta.filter(
      (m) => m.activo || m.nombre === fMarca
    );
    if (fMarca && !list.some((m) => m.nombre === fMarca)) {
      return [...list, { id: `legacy-${fMarca}`, nombre: fMarca, activo: false, orden: 999, modelos: [] }];
    }
    return list;
  }, [marcasCamioneta, fMarca]);

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
      const [cami, chof, emp, usu, tServ, marcas, tall, tallMeta] =
        await Promise.all([
          apiFetch<Camioneta[]>(
            canEdit ? "/api/camionetas?incluirInactivas=1" : "/api/camionetas",
            {},
            token
          ),
          apiFetch<Chofer[]>(
            canEdit ? "/api/choferes?incluirBajas=1" : "/api/choferes",
            {},
            token
          ),
          apiFetch<Empresa[]>("/api/empresas", {}, token),
          apiFetch<User[]>("/api/usuarios", {}, token),
          apiFetch<TipoServicio[]>("/api/tipos-servicio", {}, token),
          apiFetch<MarcaCamionetaAbm[]>("/api/marcas-camioneta", {}, token).catch(
            () => [] as MarcaCamionetaAbm[]
          ),
          apiFetch<TallerProveedor[]>("/api/talleres-proveedores", {}, token),
          apiFetch<{ tipos: TipoTaller[] }>(
            "/api/talleres-proveedores/meta",
            {},
            token
          ).catch(() => ({ tipos: Object.keys(TIPO_TALLER_LABEL) as TipoTaller[] })),
        ]);
      setCamionetas(Array.isArray(cami) ? cami : []);
      setChoferes(Array.isArray(chof) ? chof : []);
      setEmpresas(Array.isArray(emp) ? emp : []);
      setUsuarios(Array.isArray(usu) ? usu : []);
      setTiposServicio(Array.isArray(tServ) ? tServ : []);
      setMarcasCamioneta(Array.isArray(marcas) ? marcas : []);
      setTalleres(Array.isArray(tall) ? tall : []);
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
  }, [token, canEdit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (vistaUsuarios) setTab("usuarios");
    else if (tab === "usuarios") setTab("empresas");
  }, [vistaUsuarios]); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate(kind: NonNullable<typeof form>["kind"]) {
    setFormError(null);
    setFNombre("");
    setFDni("");
    setFCuil("");
    setFLicenciaVenc("");
    setFTelefono("");
    setFEmailChofer("");
    setFEsDueno(false);
    setFVerMant(true);
    setFVerTaller(true);
    setFEstadoChofer("ACTIVO");
    setFCuit("");
    setFPasswordEmpresa("");
    setFCedulaFoto("");
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
    setFEstadoDesde("");
    setFEstadoHasta("");
    setFEmpresaId("");
    setFEmail("");
    setFPassword("");
    setFRol("OPERACIONES");
    setFApellido("");
    setFChoferEmpresaId("");
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
    setFApellido(item.apellido ?? "");
    setFChoferEmpresaId(item.empresaId ?? "");
    setFDni(item.dni);
    setFCuil(item.cuil ?? "");
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
    setFCuit(item.cuit ?? "");
    setFPasswordEmpresa("");
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
    setFEstadoDesde(
      item.estadoDesde ? item.estadoDesde.slice(0, 10) : ""
    );
    setFEstadoHasta(
      item.estadoHasta ? item.estadoHasta.slice(0, 10) : ""
    );
    setFEmpresaId(item.empresaId ?? currentAsignacion(item)?.empresaId ?? "");
    setForm({ kind: "camioneta", item });
  }

  function openEditUsuario(item: User) {
    setFormError(null);
    setFNombre(item.nombre ?? "");
    setFApellido(item.apellido ?? "");
    setFDni(item.dni ?? "");
    setFChoferEmpresaId(item.empresaId ?? "");
    setFEmail(item.email);
    setFPassword("");
    setFTelefono(item.telefono ?? "");
    setFRol(item.rol);
    setFEstadoUser(item.estado);
    setForm({ kind: "usuario", item });
  }

  async function generarPasswordTemporal(
    kind: "usuario" | "empresa" | "chofer",
    id: string
  ) {
    if (!token || !canEdit) return;
    showNotice({
      title: "Generar contraseña temporal",
      message:
        "Se creará una contraseña nueva. Se mostrará una sola vez y el usuario deberá cambiarla en el próximo ingreso.",
      variant: "confirm",
      confirmLabel: "Generar",
      onConfirm: () => {
        setNotice(null);
        void (async () => {
          const path =
            kind === "usuario"
              ? `/api/usuarios/${id}/password`
              : kind === "empresa"
                ? `/api/empresas/${id}/password`
                : `/api/choferes/${id}/password`;
          try {
            const res = await apiFetch<{ credencialTemporal: string }>(
              path,
              { method: "POST", body: "{}" },
              token
            );
            showPasswordNotice(res.credencialTemporal);
          } catch (err) {
            showErrorNotice(
              err instanceof ApiError
                ? err.message
                : "No se pudo generar la contraseña temporal"
            );
          }
        })();
      },
    });
  }

  async function submitForm() {
    if (!token || !form) return;
    setFormError(null);
    try {
      if (form.kind === "chofer") {
        if (!fChoferEmpresaId) {
          setFormError("El chofer se asigna a una empresa existente");
          return;
        }
        const body = {
          nombre: fNombre,
          apellido: fApellido,
          empresaId: fChoferEmpresaId,
          dni: fDni,
          cuil: fCuil || null,
          licencia: null,
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
          cuit: fCuit || null,
          password: fPasswordEmpresa || undefined,
        };
        if (form.item) {
          const updated = await apiFetch<Empresa & { credencialTemporal?: string }>(
            `/api/empresas/${form.item.id}`,
            { method: "PUT", body: JSON.stringify(body) },
            token
          );
          if (updated.credencialTemporal) {
            showPasswordNotice(updated.credencialTemporal, "Contraseña actualizada");
          }
          setEmpresas((prev) =>
            prev.map((e) => (e.id === updated.id ? updated : e))
          );
        } else {
          const created = await apiFetch<Empresa & { credencialTemporal?: string }>(
            "/api/empresas",
            { method: "POST", body: JSON.stringify(body) },
            token
          );
          if (created.credencialTemporal) {
            showPasswordNotice(created.credencialTemporal, "Empresa creada");
          }
          setEmpresas((prev) =>
            [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre))
          );
        }
      }

      if (form.kind === "camioneta") {
        if (!fEmpresaId) {
          setFormError("La unidad se asigna a una empresa existente");
          return;
        }
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
          estadoDesde: fEstadoCam === "OPERATIVA" ? null : fEstadoDesde || null,
          estadoHasta: fEstadoCam === "OPERATIVA" ? null : fEstadoHasta || null,
          empresaId: fEmpresaId || null,
          cedulaFoto: fCedulaFoto || undefined,
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
          apellido: fApellido || null,
          dni: fDni || null,
          empresaId: fChoferEmpresaId || null,
          estado: fEstadoUser,
          telefono: fTelefono.trim() || null,
        };
        if (fPassword) body.password = fPassword;
        if (!form.item && !fChoferEmpresaId && (fRol === "EMPRESA" || fRol === "CHOFER")) {
          setFormError("Elegí la empresa del usuario");
          return;
        }
        if (form.item) {
          const updated = await apiFetch<User>(
            `/api/usuarios/${form.item.id}`,
            { method: "PUT", body: JSON.stringify(body) },
            token
          );
          setUsuarios((prev) =>
            prev.map((u) => (u.id === updated.id ? updated : u))
          );
          if (updated.choferId) {
            setChoferes((prev) =>
              prev.map((c) =>
                c.id === updated.choferId
                  ? { ...c, telefono: updated.telefono ?? null }
                  : c
              )
            );
          }
        } else {
          const created = await apiFetch<User & { credencialTemporal?: string }>(
            "/api/usuarios",
            { method: "POST", body: JSON.stringify(body) },
            token
          );
          if (created.credencialTemporal) {
            showPasswordNotice(
              created.credencialTemporal,
              "Usuario creado"
            );
          }
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

  async function deleteEntity(id: string) {
    if (!token || !canEdit) return;
    if (!confirm("¿Eliminar este registro?")) return;
    try {
      await apiFetch(`/api/usuarios/${id}`, { method: "DELETE" }, token);
      setUsuarios((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
  }

  async function inactivarEmpresa(id: string) {
    if (!token || !canEdit) return;
    if (
      !confirm(
        "¿Inactivar esta empresa? Se conservan historial, choferes y unidades (quedan inactivos)."
      )
    ) {
      return;
    }
    try {
      const updated = await apiFetch<Empresa>(
        `/api/empresas/${id}`,
        { method: "DELETE" },
        token
      );
      setEmpresas((p) =>
        p.map((x) => (x.id === id ? { ...x, ...updated, activo: false } : x))
      );
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo inactivar");
    }
  }

  async function reactivarEmpresa(id: string) {
    if (!token || !canEdit) return;
    if (
      !confirm(
        "¿Activar esta empresa? Se reactivan también sus choferes, unidades y usuarios de empresa."
      )
    ) {
      return;
    }
    try {
      const updated = await apiFetch<Empresa>(
        `/api/empresas/${id}/reactivar`,
        { method: "POST" },
        token
      );
      setEmpresas((p) =>
        p.map((x) => (x.id === id ? { ...x, ...updated, activo: true } : x))
      );
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo activar");
    }
  }

  async function eliminarEmpresa(id: string) {
    if (!token || !canEdit) return;
    if (
      !confirm(
        "¿Eliminar definitivamente esta empresa? Se borran también sus choferes y unidades sin historial de pedidos/taller. Esta acción no se puede deshacer."
      )
    ) {
      return;
    }
    try {
      await apiFetch(`/api/empresas/${id}/eliminar`, { method: "POST" }, token);
      setEmpresas((p) => p.filter((x) => x.id !== id));
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
  }

  /** Baja lógica: chofer → INACTIVO (DELETE /choferes/:id), camioneta → FUERA_SERVICIO (POST /baja). */
  async function reactivarUnidad(id: string) {
    if (!token || !canEdit) return;
    try {
      const updated = await apiFetch<Camioneta>(
        `/api/camionetas/${id}/reactivar`,
        { method: "POST" },
        token
      );
      setCamionetas((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo reactivar");
    }
  }

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
        marcasModelos: null,
        equiposFrio: null,
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
    { id: "empresas", label: "Empresas" },
    { id: "camioneta", label: "Unidades" },
    { id: "chofer", label: "Choferes" },
    { id: "asignacion", label: "Asignación flota" },
    { id: "tiposServicio", label: "Tipos de servicio" },
    { id: "marcasModelos", label: "Marcas y modelos" },
    { id: "equiposFrio", label: "Equipo de frío" },
  ];

  const camionetasFiltradas = useMemo(() => {
    const list = Array.isArray(camionetas) ? camionetas : [];
    const visibles =
      unitFilters.estado.length === 0
        ? list.filter((c) => c.estado !== "INACTIVA")
        : list;
    return filterCamionetas(visibles, unitFilters);
  }, [camionetas, unitFilters]);

  const unidadesDeEmpresaAsig = useMemo(() => {
    if (!asigEmpresaId) return [] as Camioneta[];
    return (Array.isArray(camionetas) ? camionetas : [])
      .filter((c) => {
        if (c.estado === "INACTIVA" || c.estado === "FUERA_SERVICIO") return false;
        if (c.empresaId === asigEmpresaId) return true;
        const a = currentAsignacion(c);
        return a?.empresaId === asigEmpresaId;
      })
      .sort((a, b) => a.patente.localeCompare(b.patente));
  }, [camionetas, asigEmpresaId]);

  const empresaAsig = useMemo(
    () => empresas.find((e) => e.id === asigEmpresaId) ?? null,
    [empresas, asigEmpresaId]
  );

  /** Cuántas unidades de esta empresa tiene cada chofer (asignación abierta). */
  const unidadesPorChoferAsig = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of unidadesDeEmpresaAsig) {
      for (const a of currentAsignaciones(c)) {
        if (!a?.choferId) continue;
        map.set(a.choferId, (map.get(a.choferId) ?? 0) + 1);
      }
    }
    return map;
  }, [unidadesDeEmpresaAsig]);

  /** Solo choferes de la empresa elegida (o libres para incorporar). No los de otra empresa. */
  const choferesDeEmpresaAsig = useMemo(() => {
    if (!asigEmpresaId) return [] as Chofer[];
    return (Array.isArray(choferes) ? choferes : [])
      .filter((ch) => ch.estado === "ACTIVO" && ch.empresaId === asigEmpresaId)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [choferes, asigEmpresaId]);

  useEffect(() => {
    if (!asigEmpresaId) {
      setAsigChoferByUnit({});
      return;
    }
    const next: Record<string, string[]> = {};
    for (const c of unidadesDeEmpresaAsig) {
      next[c.id] = currentAsignaciones(c)
        .map((a) => a.choferId)
        .filter(Boolean);
    }
    setAsigChoferByUnit(next);
  }, [asigEmpresaId, unidadesDeEmpresaAsig]);

  function toggleAsigChofer(camionetaId: string, choferId: string) {
    setAsigChoferByUnit((prev) => {
      const cur = prev[camionetaId] ?? [];
      const on = cur.includes(choferId);
      return {
        ...prev,
        [camionetaId]: on
          ? cur.filter((id) => id !== choferId)
          : [...cur, choferId],
      };
    });
  }

  async function guardarAsignacionUnidad(camionetaId: string) {
    if (!token || !asigEmpresaId) return;
    const choferIds = asigChoferByUnit[camionetaId] ?? [];
    if (choferIds.length === 0) {
      setAsigError("Elegí al menos un chofer para guardar la asignación");
      return;
    }
    setAsigSavingId(camionetaId);
    setAsigError(null);
    try {
      const updated = await apiFetch<Camioneta>(
        `/api/camionetas/${camionetaId}/asignacion`,
        {
          method: "POST",
          body: JSON.stringify({ choferIds, empresaId: asigEmpresaId }),
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

  const choferCounts = useMemo(
    () => ({
      activos: choferes.filter((c) => c.estado === "ACTIVO").length,
      inactivos: choferes.filter((c) => c.estado === "INACTIVO").length,
      todos: choferes.length,
    }),
    [choferes]
  );

  const choferesFiltrados = useMemo(() => {
    let list = choferes;
    if (choferEstadoFiltro === "ACTIVO") {
      list = list.filter((c) => c.estado === "ACTIVO");
    } else if (choferEstadoFiltro === "INACTIVO") {
      list = list.filter((c) => c.estado === "INACTIVO");
    }
    const q = choferQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
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
  }, [choferes, choferQuery, choferEstadoFiltro]);

  const usuariosFiltrados = useMemo(() => {
    const internos: Role[] = ["ADMINISTRADOR", "OPERACIONES", "SUGERENCIAS"];
    const q = userQuery.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (!internos.includes(u.rol)) return false;
      if (userEmpresaId && u.empresaId !== userEmpresaId) return false;
      if (userRol && u.rol !== userRol) return false;
      if (!q) return true;
      const hay = [
        u.email,
        u.nombre,
        u.telefono,
        u.empresaNombre,
        u.rol,
        ROLE_LABELS[u.rol],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [usuarios, userQuery, userEmpresaId, userRol]);

  if (vistaUsuarios && !isInternalOps(user?.rol)) {
    return <Navigate to="/m5" replace />;
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              M5 · MVP
            </span>
            <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
              {vistaUsuarios
                ? "Usuarios especiales"
                : "Ficha integral: camioneta / chofer / empresa"}
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
            {vistaUsuarios
              ? "Personal interno de Vettore (administrador, operaciones, sugerencias)."
              : "Registro maestro y ABM: reasignar patentes desde acá, con historial conservado."}
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

      {!vistaUsuarios && (
      <div className="mb-4 flex flex-wrap gap-2 pb-1">
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
      )}

      {(canEdit || tab === "camioneta") && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {canEdit && CREATE_KIND_BY_TAB[tab] && (
            <button
              type="button"
              onClick={() => openCreate(CREATE_KIND_BY_TAB[tab]!)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              <Plus size={14} />
              {tab === "camioneta"
                ? "Nueva unidad"
                : `Nuevo ${CREATE_LABEL_BY_TAB[tab]}`}
            </button>
          )}
        </div>
      )}

      {!canEdit && user?.rol !== "EMPRESA" && (
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
                      · {c.km.toLocaleString("es-AR")} km
                    </div>
                    <div className="mt-2 font-semibold text-[var(--vl-heading)]">
                      {c.patente}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <Badge className={ESTADO_CAMIONETA_STYLE[c.estado]}>
                        {ESTADO_CAMIONETA_LABEL[c.estado]}
                      </Badge>
                      {c.estado !== "OPERATIVA" &&
                        (c.estadoDesde || c.estadoHasta) && (
                          <span className="text-[var(--vl-text-muted)]">
                            {c.estadoDesde
                              ? formatDate(c.estadoDesde)
                              : "—"}
                            {" → "}
                            {c.estadoHasta
                              ? formatDate(c.estadoHasta)
                              : "sin fin"}
                          </span>
                        )}
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
                      {canEdit && c.estado === "INACTIVA" && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            void reactivarUnidad(c.id);
                          }}
                          className="text-emerald-700 underline-offset-2 hover:underline"
                        >
                          Reactivar
                        </span>
                      )}
                      {canEdit && c.estado !== "FUERA_SERVICIO" && c.estado !== "INACTIVA" && (
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
          <div className="mb-4 space-y-3">
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setChoferEstadoFiltro("ACTIVO")}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    choferEstadoFiltro === "ACTIVO"
                      ? "border-emerald-600 bg-emerald-500/20 text-emerald-900 dark:border-emerald-400 dark:text-emerald-100"
                      : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                  }`}
                >
                  Activos ({choferCounts.activos})
                </button>
                <button
                  type="button"
                  onClick={() => setChoferEstadoFiltro("INACTIVO")}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    choferEstadoFiltro === "INACTIVO"
                      ? "border-slate-600 bg-slate-500/20 text-slate-900 dark:border-slate-400 dark:text-slate-100"
                      : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                  }`}
                >
                  Baja / inactivos ({choferCounts.inactivos})
                </button>
                <button
                  type="button"
                  onClick={() => setChoferEstadoFiltro("TODOS")}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    choferEstadoFiltro === "TODOS"
                      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                      : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                  }`}
                >
                  Todos ({choferCounts.todos})
                </button>
              </div>
            )}
            <input
              type="search"
              value={choferQuery}
              onChange={(e) => setChoferQuery(e.target.value)}
              placeholder="Buscar chofer por nombre, DNI, CUIL…"
              className="min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2 text-sm text-[var(--vl-text)] outline-none focus:border-[#1e4080]"
            />
            <p className="text-[11px] text-[var(--vl-text-muted)]">
              Mostrando {choferesFiltrados.length}
              {choferEstadoFiltro === "TODOS"
                ? ` de ${choferCounts.todos}`
                : choferEstadoFiltro === "ACTIVO"
                  ? ` activo${choferesFiltrados.length === 1 ? "" : "s"}`
                  : ` en baja / inactivo${choferesFiltrados.length === 1 ? "" : "s"}`}
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
                    {c.estado === "INACTIVO" ? "Baja" : "Activo"}
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
            Elegí la empresa y asigná uno o más choferes a cada patente. Solo
            aparecen choferes de esa empresa.
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
          {empresaAsig && !empresaAsig.permiteMultiCamioneta && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Esta empresa restringe un chofer a una sola patente a la vez. Al
              sumarlo a otra unidad se libera la anterior.
            </p>
          )}
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
                    <th className="px-3 py-2">Choferes asignados</th>
                    <th className="px-3 py-2">Selección múltiple</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {unidadesDeEmpresaAsig.map((c) => {
                    const abiertas = currentAsignaciones(c);
                    const selected = asigChoferByUnit[c.id] ?? [];
                    const sameSet =
                      selected.length === abiertas.length &&
                      selected.every((id) =>
                        abiertas.some((a) => a.choferId === id)
                      );
                    return (
                      <tr
                        key={c.id}
                        className="border-t border-[var(--vl-card-border)]"
                      >
                        <td className="px-3 py-2 font-medium">{c.patente}</td>
                        <td className="px-3 py-2 text-[var(--vl-text-muted)]">
                          {abiertas.length
                            ? abiertas
                                .map((a) => {
                                  const n = a.chofer
                                    ? `${a.chofer.apellido ? `${a.chofer.apellido}, ` : ""}${a.chofer.nombre}`
                                    : "—";
                                  const extra =
                                    a.choferId &&
                                    (unidadesPorChoferAsig.get(a.choferId) ?? 0) >
                                      1
                                      ? ` (${unidadesPorChoferAsig.get(a.choferId)} u.)`
                                      : "";
                                  return `${n}${extra}`;
                                })
                                .join(" · ")
                            : "Sin chofer"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex max-w-md flex-wrap gap-1.5">
                            {choferesDeEmpresaAsig.map((ch) => {
                              const on = selected.includes(ch.id);
                              return (
                                <label
                                  key={ch.id}
                                  className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                                    on
                                      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                      : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                                  } ${!canAssign ? "opacity-50" : ""}`}
                                >
                                  <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={on}
                                    disabled={!canAssign}
                                    onChange={() =>
                                      toggleAsigChofer(c.id, ch.id)
                                    }
                                  />
                                  {ch.nombre}
                                  {ch.apellido ? ` ${ch.apellido}` : ""}
                                </label>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canAssign && (
                            <button
                              type="button"
                              disabled={
                                selected.length === 0 ||
                                asigSavingId === c.id ||
                                sameSet
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
          headers={["Nombre", "CUIT", "Estado", "Choferes", ""]}
          rows={empresas.map((e) => {
            const wa = whatsappDigits(e.contacto);
            const choferesEmp = e.choferes ?? [];
            const activa = e.activo !== false;
            return [
              e.nombre,
              e.cuit || "—",
              activa ? "Activa" : "Inactiva",
              choferesEmp.length
                ? choferesEmp
                    .map((c) => `${c.apellido ? `${c.apellido}, ` : ""}${c.nombre} (${c.dni})`)
                    .join(" · ")
                : "Sin choferes",
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
                  <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => openEditEmpresa(e)}
                      className="text-slate-500 hover:text-slate-800"
                    >
                      Editar
                    </button>
                    {activa ? (
                      <button
                        type="button"
                        onClick={() => void inactivarEmpresa(e.id)}
                        className="text-amber-700 hover:text-amber-900"
                      >
                        Inactivar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void reactivarEmpresa(e.id)}
                        className="text-emerald-700 hover:text-emerald-900"
                      >
                        Activar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void eliminarEmpresa(e.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Eliminar
                    </button>
                  </div>
                ) : null}
              </div>,
            ];
          })}
        />
      )}

      {!loading && !error && tab === "usuarios" && (
        <div className="space-y-3">
          <div className="space-y-2 rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
            <input
              type="search"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Buscar: nombre, email, teléfono, empresa, rol…"
              autoComplete="off"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setUserAdvOpen((v) => !v)}
              className="text-xs font-medium text-[var(--vl-text-muted)] underline-offset-2 hover:underline"
            >
              {userAdvOpen ? "Ocultar" : "Búsqueda avanzada"}
            </button>
            {userAdvOpen && (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-[var(--vl-text-muted)]">
                  Empresa de transporte
                  <select
                    className={`${inputClass} mt-1`}
                    value={userEmpresaId}
                    onChange={(e) => setUserEmpresaId(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[var(--vl-text-muted)]">
                  Rol
                  <select
                    className={`${inputClass} mt-1`}
                    value={userRol}
                    onChange={(e) =>
                      setUserRol((e.target.value || "") as "" | Role)
                    }
                  >
                    <option value="">Todos</option>
                    {(["ADMINISTRADOR", "OPERACIONES", "SUGERENCIAS"] as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {(userQuery.trim() || userEmpresaId || userRol) && (
              <p className="text-[11px] text-[var(--vl-text-muted)]">
                Mostrando {usuariosFiltrados.length} de {usuarios.length}
                {" · "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setUserQuery("");
                    setUserEmpresaId("");
                    setUserRol("");
                  }}
                >
                  Limpiar filtros
                </button>
              </p>
            )}
          </div>
          <EntityTable
            headers={["Email", "Nombre", "Teléfono", "Empresa", "Rol", "Estado", ""]}
            rows={usuariosFiltrados.map((u) => {
              const wa = whatsappDigits(u.telefono);
              return [
                u.email,
                u.nombre || "—",
                u.telefono || "—",
                u.empresaNombre || "—",
                ROLE_LABELS[u.rol],
                u.estado.toLowerCase(),
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-end gap-2 text-xs"
                >
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
                      onEdit={() => openEditUsuario(u)}
                      onDelete={() => void deleteEntity(u.id)}
                    />
                  ) : null}
                </div>,
              ];
            })}
          />
        </div>
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

      {!loading && !error && tab === "equiposFrio" && <EquiposFrioAbmPanel />}

      {!loading && !error && tab === "marcasModelos" && (
        <MarcasModelosAbmPanel />
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
              : form.kind === "camioneta"
                ? "Nueva unidad"
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
                required
              />
            </Field>
          )}

          {form.kind === "chofer" && (
            <>
              <Field label="Apellido">
                <input
                  className={inputClass}
                  value={fApellido}
                  onChange={(e) => setFApellido(e.target.value)}
                  required
                />
              </Field>
              <Field label="DNI">
                <input
                  className={inputClass}
                  value={fDni}
                  onChange={(e) => setFDni(e.target.value)}
                  required
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
              <Field label="CUIL">
                <input
                  className={inputClass}
                  value={fCuil}
                  onChange={(e) => setFCuil(e.target.value)}
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
              <Field label="Empresa">
                <select
                  className={inputClass}
                  value={fChoferEmpresaId}
                  onChange={(e) => setFChoferEmpresaId(e.target.value)}
                  required
                >
                  <option value="">Elegí empresa…</option>
                  {empresas
                    .filter((e) => e.activo !== false)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre} · {e.cuit || "sin CUIT"}
                      </option>
                    ))}
                </select>
              </Field>
              {form.item && (
                <div className="rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-3">
                  <p className="text-xs font-medium text-[var(--vl-heading)]">
                    Acceso a la app (DNI)
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
                    Generá una contraseña temporal; el chofer la cambia en el
                    primer ingreso.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void generarPasswordTemporal("chofer", form.item!.id)
                    }
                    className="mt-2 rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs font-semibold text-[var(--vl-heading)] hover:bg-[var(--vl-card)]"
                  >
                    Generar contraseña temporal
                  </button>
                </div>
              )}
            </>
          )}

          {form.kind === "empresa" && (
            <>
              <Field label="CUIT">
                <input
                  className={inputClass}
                  value={fCuit}
                  onChange={(e) => setFCuit(e.target.value)}
                  required
                />
              </Field>
              <Field label="Contraseña de acceso (CUIT)">
                <input
                  type="password"
                  className={inputClass}
                  value={fPasswordEmpresa}
                  placeholder={
                    form.item
                      ? "Opcional: escribir una nueva"
                      : "Vacío = generar temporal"
                  }
                  onChange={(e) => setFPasswordEmpresa(e.target.value)}
                />
              </Field>
              {form.item && (
                <div className="rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-3">
                  <p className="text-xs font-medium text-[var(--vl-heading)]">
                    Contraseña temporal
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
                    Generá una nueva; la empresa deberá cambiarla al ingresar.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void generarPasswordTemporal("empresa", form.item!.id)
                    }
                    className="mt-2 rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs font-semibold text-[var(--vl-heading)] hover:bg-[var(--vl-card)]"
                  >
                    Generar contraseña temporal
                  </button>
                </div>
              )}
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
                  {marcasActivas.map((m) => (
                    <option key={m.id} value={m.nombre}>
                      {m.nombre}
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
                  <option value="INACTIVA">Inactiva (baja definitiva)</option>
                </select>
              </Field>
              {fEstadoCam !== "OPERATIVA" && (
                <>
                  <Field label="Estado desde">
                    <input
                      type="date"
                      className={inputClass}
                      value={fEstadoDesde}
                      onChange={(e) => setFEstadoDesde(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Estado hasta">
                    <input
                      type="date"
                      className={inputClass}
                      value={fEstadoHasta}
                      onChange={(e) => setFEstadoHasta(e.target.value)}
                    />
                  </Field>
                  <p className="col-span-full text-[11px] text-[var(--vl-text-muted)]">
                    Periodo en el que la unidad permanece {fEstadoCam === "EN_TALLER" ? "en taller" : fEstadoCam === "DE_VACACIONES" ? "de vacaciones" : "fuera de servicio"}.
                    Podés dejar “hasta” vacío si aún no hay fecha de retorno.
                  </p>
                </>
              )}
              <Field label="Empresa de transporte">
                <select
                  className={inputClass}
                  value={fEmpresaId}
                  onChange={(e) => setFEmpresaId(e.target.value)}
                  required
                >
                  <option value="">Elegí la empresa…</option>
                  {empresas
                    .filter((e) => e.activo !== false)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                </select>
              </Field>
              {!form.item && (
                <Field label="Foto de cédula (obligatoria)">
                  <input
                    type="file"
                    accept="image/*"
                    className={inputClass}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setFCedulaFoto(String(reader.result ?? ""));
                      reader.readAsDataURL(file);
                    }}
                  />
                </Field>
              )}
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
              <Field label="Apellido">
                <input
                  className={inputClass}
                  value={fApellido}
                  onChange={(e) => setFApellido(e.target.value)}
                />
              </Field>
              <Field label="DNI">
                <input
                  className={inputClass}
                  value={fDni}
                  onChange={(e) => setFDni(e.target.value)}
                  required
                />
              </Field>
              <Field label="Empresa">
                <select
                  className={inputClass}
                  value={fChoferEmpresaId}
                  onChange={(e) => setFChoferEmpresaId(e.target.value)}
                >
                  <option value="">Opcional (solo si aplica)</option>
                  {empresas
                    .filter((e) => e.activo !== false)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre} · {e.cuit || "sin CUIT"}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Teléfono / WhatsApp">
                <input
                  type="tel"
                  className={inputClass}
                  value={fTelefono}
                  onChange={(e) => setFTelefono(e.target.value)}
                  placeholder="Ej: 11 5555-5555"
                  disabled={!!form.item && !form.item.choferId}
                />
                {form.item && !form.item.choferId && (
                  <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
                    Solo se edita si el usuario está vinculado a un chofer.
                  </p>
                )}
              </Field>
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
                    ? "Password (opcional: escribir una nueva)"
                    : "Password"
                }
              >
                <input
                  type="password"
                  className={inputClass}
                  value={fPassword}
                  onChange={(e) => setFPassword(e.target.value)}
                  placeholder={form.item ? "" : "Vacío = generar temporal"}
                />
              </Field>
              {form.item && (
                <div className="rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-3">
                  <p className="text-xs font-medium text-[var(--vl-heading)]">
                    Contraseña temporal
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
                    Disponible para todos los roles. El usuario la cambia en el
                    próximo ingreso.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void generarPasswordTemporal("usuario", form.item!.id)
                    }
                    className="mt-2 rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs font-semibold text-[var(--vl-heading)] hover:bg-[var(--vl-card)]"
                  >
                    Generar contraseña temporal
                  </button>
                </div>
              )}
              <Field label="Rol">
                <select
                  className={inputClass}
                  value={fRol}
                  onChange={(e) => setFRol(e.target.value as Role)}
                >
                  {(["ADMINISTRADOR", "OPERACIONES", "SUGERENCIAS"] as Role[]).map(
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

      {notice && (
        <NoticeDialog
          open
          title={notice.title}
          message={notice.message}
          highlight={notice.highlight}
          variant={notice.variant ?? "info"}
          confirmLabel={notice.confirmLabel}
          onConfirm={notice.onConfirm}
          onClose={() => setNotice(null)}
        />
      )}
    </div>
  );
}

function Actions({
  onEdit,
  onDelete,
  deleteLabel = "Eliminar",
  deleteDisabled = false,
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleteLabel?: string;
  deleteDisabled?: boolean;
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
        disabled={deleteDisabled}
        className="text-red-500 hover:text-red-700 disabled:opacity-40"
      >
        {deleteLabel}
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
