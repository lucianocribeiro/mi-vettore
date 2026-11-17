# Vettore · Módulo Liquidaciones (prototipo v7)

Prototipo funcional del módulo de liquidaciones quincenales a empresas de transporte. Es una sola página HTML con JavaScript sin framework. Lee Excel en el navegador con SheetJS.

> **Datos reales:** `data/seed.json` (y por lo tanto `app/index.html`) contiene nombres, patentes y montos reales tomados del Excel `00_Liquidacion_Transporte_Kairos_2026_Sheets.xlsx`. Tratalo como información confidencial.

## Contenido

| Ruta | Qué es |
|---|---|
| `app/index.html` | App lista para abrir en un navegador. Ya tiene embebidos el CSS y los datos. |
| `src/template.html` | Código fuente: HTML + JS. Lleva dos marcas: `/*__CSS__*/` y `__SEED__`. |
| `src/base.css` | Estilos (tema oscuro de Vettore). |
| `data/seed.json` | Datos iniciales extraídos del Excel: empresas, valores hora, patentes, historia ene–1ra oct 2026. |
| `tools/build.py` | Regenera `app/index.html` a partir de `src/` y `data/`. |
| `tools/extract_seed.py` | Regenera `data/seed.json` a partir del Excel original. |
| `ejemplos/` | Archivos de prueba para la 2da quincena de octubre 2026 (facturación y nafta Edenred). |

```bash
python tools/extract_seed.py ruta/al/Excel.xlsx data/seed.json   # opcional, requiere openpyxl
python tools/build.py
```

## Dependencias externas

- **SheetJS 0.18.5:** se carga desde cdnjs. Lee los .xlsx/.csv y genera la exportación a Excel.
- **Fuente Inter:** se carga desde Google Fonts.
- **`window.claude.use('db')` y `window.claude.use('downloads')`:** son servicios del entorno donde corre hoy el prototipo (claude.ai). Se usan para guardar datos y descargar archivos.
  - **Fuera de claude.ai, sin cambios:** la app funciona en modo "Sin guardado" (todo vive en memoria) y el botón Excel avisa que la descarga no está disponible.
  - **Para producción:** reemplazar las funciones `persist`, `loadDB` y `resetAll` por llamadas a tu backend. Para exportar a Excel, usar `XLSX.writeFile`.

## Modelo de datos (colecciones que hoy se guardan)

| Colección / doc | Contenido |
|---|---|
| `cfg/valores` | Valores hora: `{division, valor, desde, hasta}`. Vigencia abierta = `hasta:null`. |
| `cfg/divisiones` | División asignada a cada empresa. |
| `cfg/tipos` | Tipos de adelanto `{nombre, activo}`: Adelanto, Gastos camioneta, Habilitaciones, Seguros, Taller y los que agregue el usuario. |
| `adel/{id}` | Adelanto: `{fecha, empresa, tipo, desc, patente, importe, cuotas:[{n, periodo, importe}]}`. |
| `prest/{id}` | Préstamo en horas: `{fecha, empresa, concepto, totalHs, vhSol, cuotaHs, acum0, estado}`. `monto` es solo la equivalencia (`totalHs × vhSol`). |
| `fact/{periodo}` | Facturación del período: `rows:[{empresa, viajes, importe, archivo, cargado}]` y `log` de subidas. |
| `nmeta/{id}` + `nafta/{id}_{i}` | Subida de nafta: período al que se imputa, archivo, usuario, y filas A:N partidas en bloques de 450. |
| `liq/{periodo}__{empresa}` | Liquidación cerrada de una empresa: snapshot de conceptos incluidos, saldo, `ef`, `tr`, `pagado`, `fechaPago`, `modo`. |

Formato de período: `AAAA-MM-1` (del 1 al 15) o `AAAA-MM-2` (del 16 a fin de mes).

## Reglas de negocio implementadas

**Valores hora**
- Cuadro tarifario por división, con vigencia desde/hasta.
- Una "nueva vigencia" sugiere el cuadro anterior. Solo crea registros para las divisiones que cambian y cierra la vigencia previa el día anterior.
- Horas = importe facturado ÷ valor hora de la división vigente al inicio de la quincena.

**Adelantos**
- Siempre asociados a una empresa de transporte.
- **Patente:** opcional, limitada a las patentes habilitadas para esa empresa.
- **Cuotas al crear:** el monto se reparte en cuotas iguales (editables) en períodos consecutivos.
- **Corrimiento:** si se cambia el período de una cuota, las siguientes se corren +1 período cada una.
- **Orden:** una cuota no puede debitarse antes que la anterior.
- **Cuotas debitadas:** quedan fijas. Al refinanciar se reparte solo el saldo.
- **Órdenes de taller:** entran como adelanto tipo "Taller" (concepto "Taller OT - …") en 1 cuota, refinanciable.

**Préstamos**
- Se registran en horas. Cada quincena se descuenta `cuotaHs × valor hora vigente` hasta completar `totalHs`.
- Estado Activo / Pausado. El acumulado = `acum0` + horas de las liquidaciones cerradas.

**Facturación**
- El usuario elige el período antes de subir. Columnas `Empresa`, `# Transporte`, `Importe` (sin fecha).
- Es acumulable.
- **Empresa repetida en el mismo período:** avisa que ya fue procesada y pide confirmación explícita para sobrescribir.
- **Empresas ya liquidadas:** no se pueden pisar.

**Nafta**
- El usuario elige a qué período imputa la subida. Se permiten varias subidas.
- **Duplicados:** una carga con la misma fecha + hora + patente + importe nunca entra dos veces, aunque esté en otro período (incluye la historia del Excel).
- **Tipo:** columna G "GAS NATURAL COMPRIMIDO" → GNC; el resto → Nafta.
- **Asignación:** cada carga va a la empresa que tenía la patente en la fecha de carga.
- **Borrado:** solo un Administrador puede borrar una subida, y solo si no tiene cargas liquidadas.

**Liquidación**
- Paso 0: elegir período. La sábana muestra todas las empresas activas: Facturación, Nafta, Adelantos, Préstamos, Saldo.
- Trae lo pendiente con período ≤ al liquidado: cuotas de adelantos, grupos de nafta (patente + tipo) y cuota de préstamos.
- **Detalle de una empresa:** se puede destildar nafta, cuotas de adelantos o préstamos (y ajustar horas). Lo destildado queda pendiente para el período siguiente.
- **Cierre masivo** ("Cerrar sin revisar"): cierra lo seleccionado tal cual la previsualización.
- **Saldo negativo:** no se puede cerrar hasta destildar conceptos.
- **Saldo $0:** también se cierra; queda como "Sin pago".
- **Reabrir:** posible mientras no esté pagada.

**Pago**
- Lista las liquidaciones cerradas con saldo > 0.
- Se ingresa el efectivo (entre $0 y el saldo); la transferencia es la diferencia, así siempre se cancela el total.
- Hay registro individual o masivo con fecha. Un pago se puede anular.

**Panel de control**
- Consulta por período o por empresa de las liquidaciones cerradas. Exporta a Excel.

## Datos del Excel: qué hay que saber

- **Período pendiente:** la historia se cargó cerrada de ene a 1ra oct 2026. La 2da oct 2026 quedó pendiente, para probar con `ejemplos/`.
- **Diferencias en la historia:** 1.141 de 1.253 pagos históricos coinciden al peso con lo que surge de las hojas de origen. Las diferencias se concentran en ene–feb. El Panel las marca como "difiere".
- **Fechas como texto:** 5.262 filas de "Consumo Nafta" tienen la fecha como texto `d/m/aaaa`. `extract_seed.py` las convierte.
- **Préstamos en pesos:** 12 préstamos estaban en cuotas fijas de $ y se convirtieron a horas con el valor hora de la fecha de inicio.
- **Préstamos pausados:** los préstamos sin cuotas desde antes de octubre se marcaron como "Pausado".
- **Talleres:** son las filas "Taller" de la hoja "Gastos Camionetas", usadas como si fueran órdenes del módulo Talleres.
- **Patentes:** la asignación patente → empresa sale de la hoja "ABM Patentes". En producción debe salir de Asignación flota.

## Pendientes para la versión operativa

- **Backend y usuarios:** base de datos real, autenticación y roles (hoy el rol Operador / Administrador es un selector local).
- **Empresas y patentes:** integrar el ABM de empresas y la Asignación flota del sistema existente, en lugar de `seed.json`.
- **Talleres:** integrar el módulo Talleres para que las órdenes pagadas generen el adelanto automáticamente.
- **Préstamos:** rediseño, según lo conversado.
