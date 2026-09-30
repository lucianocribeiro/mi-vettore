import assert from "node:assert/strict";
import { validarJerarquia, type ParsedFlota } from "./flota-import.js";

const base: ParsedFlota = {
  empresas: [{ fila: 2, cuit: "30700000001", nombre: "A", contacto: "" }],
  choferes: [
    {
      fila: 2,
      cuit: "30700000001",
      dni: "30111222",
      nombre: "Ana",
      apellido: "Perez",
      telefono: "",
      email: "",
    },
  ],
  unidades: [
    {
      fila: 2,
      cuit: "30999999999",
      patente: "AB123CD",
      dniChoferes: [],
      marca: "",
      modelo: "",
      anio: null,
      km: null,
      equipoFrio: "",
    },
  ],
};

const errores = validarJerarquia(base, new Set());
assert.equal(errores.length, 1);
assert.equal(errores[0]?.hoja, "Unidades");
assert.equal(validarJerarquia(base, new Set(["30999999999"])).length, 0);

const repetida: ParsedFlota = {
  ...base,
  unidades: [base.unidades[0]!, { ...base.unidades[0]!, fila: 3 }],
};
assert.equal(
  validarJerarquia(repetida, new Set(["30999999999"])).filter((e) => e.mensaje.includes("repetida")).length,
  1
);
console.log("flota-import tests ok");
