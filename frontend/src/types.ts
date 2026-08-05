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

/** Pueden ver el inbox de sugerencias. */
export const SUGERENCIAS_VIEW_ROLES: Role[] = [
  ...INTERNAL_OPS_ROLES,
  "SUGERENCIAS",
];

export function canWriteMaster(rol?: Role | null): boolean {
  return !!rol && MASTER_WRITE_ROLES.includes(rol);
}

export function isInternalOps(rol?: Role | null): boolean {
  return !!rol && INTERNAL_OPS_ROLES.includes(rol);
}

export function canViewSugerencias(rol?: Role | null): boolean {
  return !!rol && SUGERENCIAS_VIEW_ROLES.includes(rol);
}

export function isSugerenciasOnly(rol?: Role | null): boolean {
  return rol === "SUGERENCIAS";
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

export const MARCAS_CAMIONETA = [
  "Renault",
  "Peugeot",
  "Fiat",
  "Volkswagen",
  "Ford",
  "Chevrolet",
  "Mercedes-Benz",
  "Iveco",
  "Otra",
] as const;

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
  tipoTransporte: TipoTransporte | null;
  tipoServicioId: string | null;
  tipoServicio?: TipoServicio | null;
  datosTecnicos: string | null;
  km: number;
  fechaUltimoAceite: string | null;
  fechaCambioCorrea: string | null;
  fechaCambioNeumaticos: string | null;
  fechaCambioBateria: string | null;
  seguroCompania: string | null;
  seguroVencimiento: string | null;
  vtbVencimiento: string | null;
  estado: EstadoCamioneta;
  asignaciones?: AsignacionFlota[];
};

export function currentAsignacion(camioneta: Camioneta): AsignacionFlota | null {
  const list = camioneta.asignaciones ?? [];
  return list.find((a) => !a.periodoHasta) ?? list[0] ?? null;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR");
}
