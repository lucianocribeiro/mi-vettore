/** Árbol de diagnóstico (planilla MI VETTORE) — niveles 1 / 2 / 3. */
export const DIAGNOSTICO_SEED: {
  nombre: string;
  hijos?: { nombre: string; hijos?: string[] }[];
}[] = [
  {
    nombre: "Taller Mecánico",
    hijos: [
      {
        nombre: "Aceite",
        hijos: [
          "Servicio",
          "Servicio y Distribución",
          "Bomba de Aceite",
          "Pérdida Aceite",
          "Otros",
        ],
      },
      {
        nombre: "Agua - Temp",
        hijos: [
          "Radiador",
          "Electro Ventilador",
          "Bomba Agua",
          "Pérdida Agua",
          "Otros",
        ],
      },
      {
        nombre: "Suspensión",
        hijos: ["Amortiguadores", "Tren Delantero", "Tren Trasero", "Otros"],
      },
      {
        nombre: "Frenos",
        hijos: [
          "Delanteros",
          "Traseros",
          "Bomba Freno",
          "Líquido",
          "Otros",
        ],
      },
      {
        nombre: "Electricidad",
        hijos: [
          "Alternador",
          "Burro Arranque",
          "Cables y Bujías",
          "Inyección",
          "Otros",
        ],
      },
      {
        nombre: "Motor",
        hijos: [
          "Correa Poli V",
          "Pata Caja/Motor",
          "Bomba Nafta/Gasoil",
          "Tapa",
          "Motor",
          "Otros",
        ],
      },
      {
        nombre: "Dirección",
        hijos: [
          "Bomba Hidráulica",
          "Cremallera",
          "Pérdida Líquido Hidráulico",
          "Otros",
        ],
      },
      {
        nombre: "Caja",
        hijos: ["Embrague", "Caja de cambios", "Pérdida aceite caja", "Otros"],
      },
    ],
  },
  {
    nombre: "Taller Frío",
    hijos: [
      {
        nombre: "Gas / Circuito",
        hijos: ["Pérdida de gas", "Carga de gas", "Otros"],
      },
      {
        nombre: "Compresor",
        hijos: ["Compresor", "Embrague compresor", "Otros"],
      },
      {
        nombre: "Evaporador / Condensador",
        hijos: ["Evaporador", "Condensador", "Otros"],
      },
      {
        nombre: "Control",
        hijos: ["Termostato", "Control / Display", "Otros"],
      },
    ],
  },
  {
    nombre: "Chapa y Pintura",
    hijos: [
      {
        nombre: "Chapa",
        hijos: ["Abolladura", "Enderezado", "Soldadura", "Otros"],
      },
      {
        nombre: "Pintura",
        hijos: ["Pintura parcial", "Pintura total", "Otros"],
      },
    ],
  },
  {
    nombre: "Neumáticos / Batería / GNC",
    hijos: [
      {
        nombre: "Neumáticos",
        hijos: ["Pinchadura", "Cambio de cubiertas", "Alineación", "Otros"],
      },
      {
        nombre: "Batería",
        hijos: ["Cambio de batería", "No arranca", "Otros"],
      },
      {
        nombre: "GNC",
        hijos: ["Cilindro", "Válvula", "Revisión periódica", "Otros"],
      },
    ],
  },
];
