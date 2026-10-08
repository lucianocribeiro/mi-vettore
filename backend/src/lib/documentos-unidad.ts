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
    label: "Cédula (frente)",
    obligatorio: true,
    vencimiento: false,
    soloImagen: true,
    alerta: false,
  },
  {
    tipo: TipoDocumento.CEDULA_DORSO,
    orden: 2,
    label: "Cédula (dorso)",
    obligatorio: true,
    vencimiento: false,
    soloImagen: true,
    alerta: false,
  },
  {
    tipo: TipoDocumento.SEGURO,
    orden: 3,
    label: "Seguro",
    obligatorio: true,
    vencimiento: true,
    soloImagen: false,
    alerta: true,
  },
  {
    tipo: TipoDocumento.VTV,
    orden: 4,
    label: "RTO",
    obligatorio: true,
    vencimiento: true,
    soloImagen: false,
    alerta: true,
  },
  {
    tipo: TipoDocumento.SENASA,
    orden: 5,
    label: "SENASA",
    obligatorio: false,
    vencimiento: true,
    soloImagen: false,
    alerta: true,
  },
  {
    tipo: TipoDocumento.HOMOLOGACION,
    orden: 6,
    label: "Homologación",
    obligatorio: false,
    vencimiento: false,
    soloImagen: false,
    alerta: false,
  },
  {
    tipo: TipoDocumento.FOTO_VEHICULO,
    orden: 7,
    label: "Foto: frente",
    obligatorio: true,
    vencimiento: false,
    soloImagen: true,
    alerta: false,
  },
  {
    tipo: TipoDocumento.FOTO_ATRAS,
    orden: 8,
    label: "Foto: atrás",
    obligatorio: true,
    vencimiento: false,
    soloImagen: true,
    alerta: false,
  },
  {
    tipo: TipoDocumento.FOTO_LATERAL_IZQ,
    orden: 9,
    label: "Foto: lateral izquierdo",
    obligatorio: true,
    vencimiento: false,
    soloImagen: true,
    alerta: false,
  },
  {
    tipo: TipoDocumento.FOTO_LATERAL_DER,
    orden: 10,
    label: "Foto: lateral derecho",
    obligatorio: true,
    vencimiento: false,
    soloImagen: true,
    alerta: false,
  },
  {
    tipo: TipoDocumento.FOTO_CARGA,
    orden: 11,
    label: "Foto: carga",
    obligatorio: true,
    vencimiento: false,
    soloImagen: true,
    alerta: false,
  },
];

export const DOCS_UNIDAD_ORDEN = DOCS_UNIDAD.map((d) => d.tipo);

export function metaDocUnidad(tipo: TipoDocumento): DocUnidadMeta | undefined {
  return DOCS_UNIDAD.find((d) => d.tipo === tipo);
}
