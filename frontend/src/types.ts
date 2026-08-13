export type Role =
  | "CLIENTE"
  | "CHOFER"
  | "PABLO"
  | "SILVINA"
  | "FACU"
  | "PATRICIO"
  | "JULIETA"
  | "CARLA"
  | "SUGERENCIAS";

export type User = {
  id: string;
  email: string;
  rol: Role;
  nombre: string | null;
  estado: "ACTIVO" | "INACTIVO";
  clienteId?: string | null;
  choferId?: string | null;
  /** Solo aplica si rol=CHOFER: ve todas las unidades de su empresa */
  esDuenoFlota?: boolean;
  /** Empresa de transporte vigente (asignación actual) */
  empresaNombre?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export const ROLE_LABELS: Record<Role, string> = {
  CLIENTE: "Cliente",
  CHOFER: "Chofer",
  PABLO: "Pablo (Ops)",
  SILVINA: "Silvina (Flota)",
  FACU: "Facu (Flota)",
  PATRICIO: "Patricio (Dirección)",
  JULIETA: "Julieta (Dirección)",
  CARLA: "Carla (Administración)",
  SUGERENCIAS: "Sugerencias",
};

export const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

export const MASTER_WRITE_ROLES: Role[] = [
  "PABLO",
  "SILVINA",
  "FACU",
  "PATRICIO",
  "JULIETA",
];

/** Ops internos (incluye Carla): export Excel y paneles de operación. */
export const INTERNAL_OPS_ROLES: Role[] = [
  "PABLO",
  "SILVINA",
  "FACU",
  "PATRICIO",
  "JULIETA",
  "CARLA",
];

/** Solo el rol SUGERENCIAS ve el inbox de feedback. */
export const SUGERENCIAS_VIEW_ROLES: Role[] = ["SUGERENCIAS"];

export function canWriteMaster(rol?: Role | null): boolean {
  return !!rol && MASTER_WRITE_ROLES.includes(rol);
}

export function isInternalOps(rol?: Role | null): boolean {
  return !!rol && INTERNAL_OPS_ROLES.includes(rol);
}

export function canViewSugerencias(rol?: Role | null): boolean {
  return rol === "SUGERENCIAS";
}

export function isSugerenciasOnly(rol?: Role | null): boolean {
  return rol === "SUGERENCIAS";
}

/** Silvina, Patricio y Julieta pueden corregir/borrar con motivo. */
export const ADMIN_CORRECCION_ROLES: Role[] = [
  "SILVINA",
  "PATRICIO",
  "JULIETA",
];

export function canAdminCorregir(rol?: Role | null): boolean {
  return !!rol && ADMIN_CORRECCION_ROLES.includes(rol);
}

export type SegmentoCliente = "ESTATICO" | "CONSULTA" | "CONFIRMACION";
export type EstadoChofer = "ACTIVO" | "INACTIVO";
export type EstadoCamioneta =
  | "OPERATIVA"
  | "EN_TALLER"
  | "DE_VACACIONES"
  | "FUERA_SERVICIO";
export type TipoEmpresa = "PROPIA" | "ALIADA";
export type TipoTransporte =
  | "CONGELADO"
  | "SUPERCONGELADO"
  | "REFRIGERADO"
  | "SECO";

export type TipoTaller =
  | "MECANICA"
  | "REPUESTEROS"
  | "GOMERIAS"
  | "BATERIAS"
  | "GNC"
  | "FRIO";

export type TipoDocumento =
  | "DNI_FRENTE"
  | "DNI_DORSO"
  | "LICENCIA"
  | "HABILITACION_MANIPULACION"
  | "VTV"
  | "SENASA"
  | "SEGURO";

export type EstadoValidacionDoc = "PENDIENTE" | "VALIDADO" | "RECHAZADO";

export const TIPOS_DOCUMENTO_CON_VENCIMIENTO: TipoDocumento[] = [
  "LICENCIA",
  "HABILITACION_MANIPULACION",
  "VTV",
  "SENASA",
  "SEGURO",
];

export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  DNI_FRENTE: "DNI frente",
  DNI_DORSO: "DNI dorso",
  LICENCIA: "Licencia",
  HABILITACION_MANIPULACION: "Habilitación manipulación",
  VTV: "VTV",
  SENASA: "SENASA",
  SEGURO: "Seguro",
};

export const TIPO_TALLER_LABEL: Record<TipoTaller, string> = {
  MECANICA: "Mecánica",
  REPUESTEROS: "Repuesteros",
  GOMERIAS: "Gomerías",
  BATERIAS: "Baterías",
  GNC: "GNC",
  FRIO: "Frío",
};

export const MARCAS_CAMIONETA = [
  "Fiat",
  "Peugeot",
  "Citroën",
  "Renault",
  "Furgón",
  "Otros",
] as const;

export type MarcaCamioneta = (typeof MARCAS_CAMIONETA)[number];

export const MARCA_MODELO_CAMIONETA: Record<MarcaCamioneta, readonly string[]> =
  {
    Fiat: ["Fiorino Fire", "Fiorino Evo", "Otros"],
    Peugeot: ["Partner HDI", "Partner Nafta", "Partner Nafta-GNC", "Otros"],
    Citroën: ["Berlingo HDI", "Berlingo Nafta-GNC", "Otros"],
    Renault: ["Kangoo", "Otros"],
    Furgón: ["Furgón", "Otros"],
    Otros: ["Otros"],
  };

export type TipoPedido =
  | "ALTA"
  | "BAJA"
  | "CAMBIO_HORARIO"
  | "CAMBIO_RUTA"
  | "PEDIDO_ESPECIAL";

export type EstadoPedido = "PENDIENTE" | "EN_CURSO" | "RESUELTO";
export type OrigenPedido = "FORMULARIO" | "MANUAL" | "SISTEMA";

export type Cliente = {
  id: string;
  nombre: string;
  segmento: SegmentoCliente;
  contacto: string | null;
};

export type Empresa = {
  id: string;
  nombre: string;
  cuit: string | null;
  contacto: string | null;
  tipo: TipoEmpresa;
};

export type AsignacionFlota = {
  id: string;
  camionetaId: string;
  choferId: string;
  empresaId: string;
  periodoDesde: string;
  periodoHasta: string | null;
  chofer?: Chofer;
  empresa?: Empresa;
  camioneta?: Camioneta;
};

export type Chofer = {
  id: string;
  nombre: string;
  dni: string;
  cuil: string | null;
  licencia: string | null;
  licenciaVencimiento: string | null;
  telefono: string | null;
  email: string | null;
  esDuenoFlota: boolean;
  estado: EstadoChofer;
  asignaciones?: AsignacionFlota[];
};

export type TipoServicio = {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
};

export type Camioneta = {
  id: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  equipoFrio: string | null;
  capacidad: string | null;
  capacidadValor?: number | null;
  capacidadUnidad?: string | null;
  tipoTransporte: TipoTransporte | null;
  tipoServicioId: string | null;
  tipoServicio?: TipoServicio | null;
  datosTecnicos: string | null;
  km: number;
  kmActualizadoAt?: string | null;
  fechaUltimoAceite: string | null;
  fechaCambioCorrea: string | null;
  fechaCambioNeumaticos: string | null;
  fechaCambioBateria: string | null;
  seguroCompania: string | null;
  seguroVencimiento: string | null;
  vtbVencimiento: string | null;
  estado: EstadoCamioneta;
  asignaciones?: AsignacionFlota[];
  /** Presente en respuestas de mantenimiento/update si el salto de km es alto. */
  alertaKmAnomalia?: boolean;
  mensaje?: string;
};

export type TallerProveedorTipo = {
  id: string;
  tallerId: string;
  tipo: TipoTaller;
};

export type TallerProveedor = {
  id: string;
  cuit: string;
  razonSocial: string;
  direccion: string | null;
  mail: string | null;
  celular: string | null;
  aliasCbu: string | null;
  activo: boolean;
  createdAt?: string;
  updatedAt?: string;
  tipos: TallerProveedorTipo[];
};

export type DocumentoEntidad = {
  id: string;
  tipo: TipoDocumento;
  choferId: string | null;
  camionetaId: string | null;
  storagePath: string;
  mimeType: string;
  nombreOriginal: string | null;
  vencimiento: string | null;
  estadoValidacion: EstadoValidacionDoc;
  validadoPorId: string | null;
  motivoRechazo: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type CategoriaDiagnostico = {
  id: string;
  nombre: string;
  padreId: string | null;
  nivel: number;
  activo: boolean;
  orden: number;
};

export function currentAsignacion(camioneta: Camioneta): AsignacionFlota | null {
  const list = camioneta.asignaciones ?? [];
  return list.find((a) => !a.periodoHasta) ?? list[0] ?? null;
}

export function currentChoferAsignacion(chofer: Chofer): AsignacionFlota | null {
  const list = chofer.asignaciones ?? [];
  return list.find((a) => !a.periodoHasta) ?? list[0] ?? null;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR");
}
