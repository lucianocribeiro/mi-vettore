/** Árbol de diagnóstico (planilla MI VETTORE) — nivel 1 / 2. */
export const DIAGNOSTICO_SEED: {
  nombre: string;
  hijos?: { nombre: string; hijos?: string[] }[];
}[] = [
  {
    nombre: "Taller Mecánico",
    hijos: [
      { nombre: "Aceite" },
      { nombre: "Agua / Temperatura" },
      { nombre: "Suspensión" },
      { nombre: "Frenos" },
      { nombre: "Electricidad" },
      { nombre: "Motor" },
      { nombre: "Dirección" },
      { nombre: "Caja" },
    ],
  },
  {
    nombre: "Taller Frío",
    hijos: [
      { nombre: "Pérdida de gas" },
      { nombre: "Compresor" },
      { nombre: "Evaporador / Condensador" },
      { nombre: "Termostato / Control" },
    ],
  },
  {
    nombre: "Chapa y Pintura",
    hijos: [{ nombre: "Chapa" }, { nombre: "Pintura" }, { nombre: "Abolladura" }],
  },
  {
    nombre: "Neumáticos / Batería / GNC",
    hijos: [
      { nombre: "Neumáticos" },
      { nombre: "Batería" },
      { nombre: "GNC" },
    ],
  },
];
