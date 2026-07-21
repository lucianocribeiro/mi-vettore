export type Role =
  | "CLIENTE"
  | "CHOFER"
  | "PABLO"
  | "SILVINA"
  | "FACU"
  | "PATRICIO"
  | "JULIETA"
  | "CARLA";

export type User = {
  id: string;
  email: string;
  rol: Role;
  nombre: string | null;
  estado: "ACTIVO" | "INACTIVO";
  clienteId?: string | null;
  choferId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export const ROLE_LABELS: Record<Role, string> = {
  CLIENTE: "Cliente",
  CHOFER: "Chofer",
  PABLO: "Pablo (Tráfico)",
  SILVINA: "Silvina (Flota)",
  FACU: "Facu (Flota)",
  PATRICIO: "Patricio (Dirección)",
  JULIETA: "Julieta (Dirección)",
  CARLA: "Carla (Administración)",
};

export const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

export const MASTER_WRITE_ROLES: Role[] = [
  "PABLO",
  "SILVINA",
  "FACU",
  "PATRICIO",
  "JULIETA",
];

export function canWriteMaster(rol?: Role | null): boolean {
  return !!rol && MASTER_WRITE_ROLES.includes(rol);
}

export type SegmentoCliente = "ESTATICO" | "CONSULTA" | "CONFIRMACION";
export type EstadoChofer = "ACTIVO" | "INACTIVO";
export type EstadoCamioneta =
  | "OPERATIVA"
  | "EN_TALLER"
  | "DE_VACACIONES"
  | "FUERA_SERVICIO";
export type TipoEmpresa = "PROPIA" | "ALIADA";

export type Cliente = {
  id: string;
  nombre: string;
  segmento: SegmentoCliente;
  contacto: string | null;
};

export type Empresa = {
  id: string;
  nombre: string;
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
  licencia: string | null;
  telefono: string | null;
  estado: EstadoChofer;
  asignaciones?: AsignacionFlota[];
};

export type Camioneta = {
  id: string;
  patente: string;
  datosTecnicos: string | null;
  km: number;
  fechaUltimoAceite: string | null;
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
