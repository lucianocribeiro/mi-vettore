import assert from "node:assert/strict";
import { parseCapacidadTexto, resolverChofer, resolverEmpresa } from "./flota-import.js";

const empresas = [
  { id: "e1", cuit: "30700000002", nombre: "Gisela Torrez" },
  { id: "e2", cuit: "30700000003", nombre: "Dúplica" },
  { id: "e3", cuit: "30700000004", nombre: "duplica" },
];
assert.deepEqual(resolverEmpresa("gisela torrez", empresas), { id: "e1" });
assert.deepEqual(resolverEmpresa("30-70000000-3", empresas), { id: "e2" });
assert.ok("error" in resolverEmpresa("Duplica", empresas));
assert.ok("error" in resolverEmpresa("No existe", empresas));

const choferes = [
  { id: "c1", dni: "30111222", nombre: "Ana", apellido: "Perez" },
  { id: "c2", dni: "30111333", nombre: "Juan", apellido: "Gomez" },
  { id: "c3", dni: "30111444", nombre: "Juan", apellido: "Diaz" },
];
assert.equal(resolverChofer("Ana Pérez", choferes)?.id, "c1");
assert.equal(resolverChofer("Ana", choferes)?.id, "c1");
assert.equal(resolverChofer("Juan", choferes), null);
assert.equal(resolverChofer("30111444", choferes)?.id, "c3");

assert.deepEqual(parseCapacidadTexto("350 kg"), {
  capacidadValor: 350,
  capacidadUnidad: "kg",
  capacidad: "350 kg",
});
assert.equal(parseCapacidadTexto("grande").capacidadValor, null);
console.log("flota-import tests ok");
