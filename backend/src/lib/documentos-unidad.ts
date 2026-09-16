import { TipoDocumento } from "@prisma/client";

export type DocUnidadMeta = {
  tipo: TipoDocumento;
  orden: number;
  label: string;
  obligatorio: boolean;
  vencimiento: boolean;
  soloImagen: boolean;
  alerta: boolean;
};

/** Orden fijo de la ficha de unidad. Fuente única para API, alta, edición y lectura. */
export const DOCS_UNIDAD: DocUnidadMeta[] = [
  {
    tipo: TipoDocumento.CEDULA,
    orden: 1,
    label: "Cédula",
    obligatorio: true,
    vencimiento: false,
    soloImagen: true,
    alerta: false,
  },
  {
    tipo: TipoDocumento.SEGURO,
    orden: 2,
    label: "Seguro",
    obligatorio: true,
    vencimiento: true,
    soloImagen: false,
    alerta: true,
  },
  {
    tipo: TipoDocumento.VTV,
    orden: 3,
    label: "RTO",
    obligatorio: true,
    vencimiento: true,
    soloImagen: false,
    alerta: true,
  },
  {
    tipo: TipoDocumento.SENASA,
    orden: 4,
    label: "SENASA",
    obligatorio: false,
    vencimiento: true,
    soloImagen: false,
    alerta: true,
  },
  {
    tipo: TipoDocumento.HOMOLOGACION,
    orden: 5,
    label: "Homologación",
    obligatorio: false,
    vencimiento: false,
    soloImagen: false,
    alerta: false,
  },
];

export const DOCS_UNIDAD_ORDEN = DOCS_UNIDAD.map((d) => d.tipo);

export function metaDocUnidad(tipo: TipoDocumento): DocUnidadMeta | undefined {
  return DOCS_UNIDAD.find((d) => d.tipo === tipo);
}
