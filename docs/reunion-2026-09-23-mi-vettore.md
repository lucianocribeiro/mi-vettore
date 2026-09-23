# Revisión semanal App "Mi Vettore"
**23 sept 2026**

**Invitados:** julieta@vettore-logistica.com.ar · patricio@vettore-logistica.com.ar · Santiago Konstantinovsky · Devs agenciakairos · Luciano Correa Ribeiro

**Archivos adjuntos:** Revisión semanal App "Mi Vettore"  
**Registros de la reunión:** Transcripción

---

## Resumen

Revisión de datos y reestructuración de menús con ajustes para choferes y unidades.

### Limpieza y roles del sistema
Se limpiaron datos de prueba y se separaron los roles de acceso entre empresas y choferes para evitar superposiciones. **Acceso de ingreso:** los choferes ingresan con **DNI + contraseña** y las empresas de transporte con **CUIT + contraseña**.

### Mejoras en formularios y menús
Se reestructuró el formulario de choferes y se reorganizó el menú principal para priorizar la asignación de flotas. En el alta de usuario (administración / operaciones) **no se elige un chofer en un desplegable**: el alta pide nombre, apellido, DNI, teléfono, email y empresa. En el primer ingreso el usuario **debe cambiar la contraseña temporal**. En el alta de empresa **se sacó el campo Contacto** y **no se usa Tipo** (propia/aliada) en la edición.

### Documentación
Orden de documentación de unidad: **1 Cédula · 2 Seguro · 3 RTO · 4 SENASA · 5 Homologación**. La **homologación no lleva fecha** ni alerta por vencimiento. En la vista de administración / operaciones: en **Unidades** se muestra solo la **patente**; en **Choferes** solo **nombre y apellido**.

### Mantenimiento y cronograma
Se definieron parámetros de mantenimiento vehicular y se estableció el cronograma de implementación para los próximos días.

---

## Decisiones

### Acordada

- **Asignación múltiple de choferes por unidad** — Se acordó implementar una selección múltiple para permitir la asignación de varios choferes a una misma unidad o patente. *(Hoy el dueño de la empresa y Vettore ya pueden asignar, reemplazar o pasar un chofer a otra unidad de su flota; la selección múltiple por patente queda como evolución acordada.)*
- **Inactivación de empresas para preservar historial** — Se acordó utilizar la inactivación de empresas en lugar de su eliminación definitiva para preservar el historial y los activos asociados.
- **Registro de pagos con múltiples métodos** — Se acordó robustecer el registro de pagos permitiendo múltiples métodos de pago con montos parciales y campos de referencia.
- **Intervalos de alerta para mantenimiento preventivo** — Se acordó establecer los parámetros de alerta para el cambio de aceite en un intervalo de 10,000 kilómetros o 3 meses.
- **Parámetros de alertas de mantenimiento** — Se estableció que los parámetros para alertas de mantenimiento son 10,000 km o 3 meses para aceite, 60,000 km o un año para distribución, y un año o límite de alerta para neumáticos y batería. *(En el detalle de la misma reunión: neumáticos 70.000–80.000 km o 1 año; batería principalmente por tiempo, ~2 años o según último cambio.)*
- **Relación automática de la ficha técnica con órdenes de trabajo** — Se determinó que la ficha técnica debe estar relacionada automáticamente con las órdenes de trabajo para actualizar kilometraje y fecha al realizar cambios como el de neumáticos.
- **Cronograma de implementación y enfoque en taller externo** — Se acordó posponer el enfoque en el menú de taller externo para la próxima semana y arrancar el uso de los cambios actuales con los datos limpios el lunes.

---

## Próximos pasos

- **[Devs agenciakairos] Limpiar datos:** Eliminar los datos de prueba y cargar la información histórica proporcionada para el lunes.
- **[Devs agenciakairos] Ajustar formularios:** Cambiar el orden de nombre, apellido y DNI, y agrupar los datos personales en el formulario de carga de choferes.
- **[Devs agenciakairos] Simplificar interfaz:** Eliminar el campo de categoría de licencia y la columna de unidades en la vista de empresas.
- **[Devs agenciakairos] Implementar inactivación:** Implementar la opción de inactivar empresas sin borrarlas y remover el selector de permitir varias unidades por chofer.
- **[Devs agenciakairos] Reestructurar acceso:** Renombrar el menú de usuarios a usuarios especiales y restringir la creación de empresas o choferes desde dicho menú. *(El alta de usuarios internos no incluye selector de chofer; empresa y chofer se dan de alta en sus ABM y generan su propio acceso con DNI/CUIT.)*
- **[Luciano Correa Ribeiro] Documentar procesos:** Registrar el caso de uso y la justificación para el futuro estado inhabilitado de vehículos y choferes.
- **[Devs agenciakairos] Optimizar menú:** Mover al menú superior los accesos directos para la marca, modelo de camionetas y tipo de servicio.
- **[Devs agenciakairos] Mejorar orden de pago:** Implementar un sistema de pagos más robusto que permita múltiples formas de pago, agregue campos de observación y referencia, y realice el control de montos.
- **[Devs agenciakairos] Ajustar formulario proveedores:** Modificar el orden de los campos al dar de alta un nuevo proveedor incluyendo dirección, mail, celular, indicación de WhatsApp y CBU.
- **[Devs agenciakairos] Filtrar talleres:** Añadir un filtro por tipo de taller para facilitar la búsqueda en el sistema.
- **[Devs agenciakairos] Exportar historial:** Incluir el árbol de reparación en el historial exportable a Excel de las órdenes de trabajo.
- **[Devs agenciakairos] Automatizar mantenimiento:** Configurar la ficha de mantenimiento para que se alimente automáticamente de las órdenes de trabajo y muestre alertas de semáforo.
- **[Devs agenciakairos] Ajustar ficha:** Reorganizar la tarjeta de mantenimiento para que la patente aparezca en la parte superior y ajustar el orden de la información visual.
- **[The group] Definir alertas:** Definir las reglas de alerta para el semáforo de mantenimiento basadas en kilometraje y fechas para aceite, distribución, neumáticos y batería.

---

## Detalles

- **Limpieza de datos de prueba y definición de fecha de corte:** Se discutió la necesidad de limpiar los datos de prueba acumulados en el sistema para comenzar a operar con información real (00:00:06). Patricio Rufener indicó que descargará un archivo Excel con la información ordenada para importar, mientras silvinasirollivettore y Devs agenciakairos participaron en definir el procedimiento operativo (00:01:19). Se acordó establecer una fecha de corte, congelando temporalmente la carga de datos hasta que Devs agenciakairos realice el vaciamiento completo y Patricio Rufener importe la información histórica real por patente (00:02:23).

- **Separación de roles de acceso para empresas de transporte y choferes:** Se abordó el problema de la superposición de roles en los permisos de usuario del sistema. Devs agenciakairos demostró que actualmente un usuario puede alternar entre empresa de transporte y chofer. Se concluyó que los roles deben estar estrictamente separados: si una cuenta pertenece a una empresa de transporte, no debe visualizar opciones de chofer, y viceversa (00:05:17). **Ingreso:** chofer con DNI + contraseña; empresa con CUIT + contraseña. En el primer ingreso con contraseña temporal, el usuario debe elegir su contraseña.

- **Reestructuración del formulario de alta de choferes:** Se revisó el diseño de la interfaz para dar de alta a un chofer. Patricio Rufener señaló que la disposición de los campos no era adecuada, ya que el documento nacional de identidad se encontraba en el centro y la empresa al final (00:06:12). Se acordó agrupar al inicio los datos personales (nombre, apellido, documento nacional de identidad, teléfono y correo electrónico) y trasladar la asignación de la empresa hacia el final del formulario. Asimismo, se decidió eliminar la categoría de licencia y gestionar dicho dato dentro del módulo de documentación (00:07:10).

- **Implementación del estado inhabilitado para choferes y unidades:** Se debatió la conveniencia de incorporar un estado de "inhabilitado" además de los estados activo e inactivo (00:09:17). Patricio Rufener argumentó que este estado resulta útil para situaciones temporales (como una persona con baja médica) para permitir el envío de correos electrónicos automatizados de seguimiento. Se acordó documentar este caso de uso para una implementación futura por parte de Devs agenciakairos e integrar contadores en tiempo real para visualizar los estados (00:10:27).

- **Asignación obligatoria de empresas a unidades y definición de estados operativos:** Se analizó el proceso de creación de nuevas unidades y su vinculación con las empresas de transporte. Se determinó que al dar de alta una nueva unidad es obligatorio asignarla de inmediato a una empresa de transporte (00:13:04). Adicionalmente, se establecieron los estados operativos de las unidades, diferenciando entre baja definitiva (para vehículos vendidos que conservan historial) e inhabilitada (para vehículos en taller o impedidos de circular) (00:13:59). *(Estado **INACTIVA** = baja definitiva / vendida, ocultable y reactivable; distinto de taller / vacaciones / fuera de servicio.)*

- **Reordenamiento del menú principal y asignación múltiple de flotas:** Se revisó la estructura de navegación y la asignación de flotas. Patricio Rufener solicitó reorganizar el menú para visualizar en orden prioritario a empresas, unidades, choferes y asignación de flota (00:14:54) (00:19:37). Devs agenciakairos presentó la interfaz de asignación de patentes a choferes, y ante la observación de Patricio Rufener de que un vehículo puede ser operado por más de una persona, se acordó configurar una selección múltiple de choferes por patente (00:16:01). El dueño de la empresa (perfil Empresa) y Vettore pueden asignar / reemplazar / pasar choferes entre unidades de la misma empresa.

- **Gestión de empresas de transporte y reglas para inactivación:** Se evaluó el procedimiento ante la baja o eliminación de empresas de transporte (00:22:14). Patricio Rufener advirtió que eliminar una empresa elimina los vínculos con sus choferes y unidades, por lo que propuso utilizar la inactivación. Se acordó permitir inactivar empresas, lo cual inactivará automáticamente sus unidades y choferes asociados, permitiendo al administrador reasignar unidades de empresas inactivas a empresas activas ante casos de reventa o reincorporación (00:23:13). En el ABM de empresa se ven sus choferes y unidades; en el alta/edición **no** se pide Tipo ni Contacto.

- **Gestión de usuarios internos y separación de perfiles especiales:** Se examinó el menú de usuarios y su diferenciación frente a las cuentas de empresas y choferes (00:25:11). Luciano Correa Ribeiro y Patricio Rufener aclararon que el alta de empresas y choferes genera sus propios accesos, por lo que el menú de usuarios debe limitarse exclusivamente a personal interno (administradores y operaciones) que opera el sistema (00:28:17). Se decidió renombrar dicho apartado como usuarios internos o especiales para evitar confusiones (00:29:04). En el alta de usuario **no** se selecciona un chofer de una lista desplegable; sí se asigna siempre a una empresa cuando corresponde.

- **Atajos en el menú superior para marcas, modelos y tipos de servicio:** Se discutió la ubicación de los módulos de configuración secundarios. Patricio Rufener indicó la necesidad de contar con accesos directos para marcas y modelos de camionetas en la barra superior (00:30:03) (00:32:12). Devs agenciakairos y Luciano Correa Ribeiro acordaron posicionar dichos elementos, junto con los tipos de servicio y equipos de frío, como atajos superiores para facilitar su acceso, manteniendo el alta de talleres dentro del módulo de proveedores (00:31:10).

- **Robustecimiento de las órdenes de pago y registros de transacciones:** silvinasirollivettore expuso inconvenientes al registrar pagos de órdenes de trabajo cerradas, indicando que las opciones de transferencia o cheque eran limitadas y no permitían ingresar números de referencia, tipos específicos de cheques ni pagos parciales (00:34:04). Patricio Rufener y Luciano Correa Ribeiro propusieron robustecer las órdenes de pago permitiendo múltiples medios de pago combinados, control automático de saldos pendientes, campos de observaciones y referencias específicas para los números de transferencia o cheques (00:34:59).

- **Organización de la documentación de unidades y datos de proveedores/talleres:** Se revisó el orden de presentación de la documentación vehicular (cédula, seguro, revisión técnica obligatoria, SENASA, homologación y fotografías) (00:41:33). **Homologación sin fecha de vencimiento.** Asimismo, silvinasirollivettore especificó los datos requeridos para los talleres en el módulo de proveedores (dirección, correo electrónico, celular con WhatsApp, Clave Bancaria Uniforme, alias y tipos de servicio). Devs agenciakairos acordó incorporar filtros por tipo de servicio en los proveedores para optimizar la solicitud de presupuestos (00:42:33).

- **Exportación del historial de talleres a Excel con detalle de reparaciones:** Se analizó la funcionalidad de exportación del historial de reparaciones de talleres a un archivo Excel (00:43:38). Patricio Rufener señaló que el reporte actual carecía del esquema o "arbolito" con el concepto y detalle mecánico de la reparación realizada. Devs agenciakairos y Luciano Correa Ribeiro acordaron integrar dicho árbol de conceptos en la exportación para permitir a Patricio Rufener utilizarlo en la carga de datos históricos y en análisis con filtros (00:44:46).

- **Control de mantenimiento, kilometraje y alertas mediante semáforos:** Se revisó el módulo de mantenimiento y seguimiento del kilometraje de las unidades. Patricio Rufener explicó que las alertas de mantenimiento (cambios de aceite, distribución, neumáticos y baterías) deben calcularse automáticamente comparando el kilometraje actual reportado por el chofer frente a los registros históricos de las órdenes de trabajo, evitando la carga manual redundante de fechas (00:47:24) (00:52:35). Se acordó definir conjuntamente las reglas de umbrales de tiempo y kilometraje para activar el sistema de alertas por semáforos y los filtros correspondientes (00:52:35) (00:54:50).

- **Parámetros y alertas de mantenimiento vehicular:** Patricio Rufener establece los intervalos específicos para las alertas y el mantenimiento de los vehículos, indicando que el cambio de aceite debe realizarse cada 10,000 kilómetros o 3 meses, y la distribución cada 60,000 kilómetros o 1 año. Asimismo, Patricio Rufener señala que los neumáticos se programarán cada 70,000 u 80,000 kilómetros o 1 año, mientras que el control de la batería se basará principalmente en el tiempo, estimando un período de dos años o rigiéndose por la fecha del último cambio y la ausencia de alertas. silvinasirollivettore y Patricio Rufener coinciden en los parámetros para aceite y distribución, acordando que el seguimiento de neumáticos y baterías debe asegurar que no existan alertas y contenga los últimos registros de kilómetros y fechas (00:56:51).

- **Actualización de neumáticos y órdenes de trabajo:** Patricio Rufener señala que los neumáticos cambiados por silvinasirollivettore no se encuentran actualizados en el sistema. silvinasirollivettore aclara que aún no cargó los neumáticos y que los últimos tres registros subidos el día anterior corresponden a otra gestión. Ante esto, Patricio Rufener solicita que la ficha del vehículo esté vinculada de manera automática con las órdenes de trabajo ejecutadas por Devs agenciakairos, de modo que al realizar un cambio se actualicen instantáneamente los kilómetros y la fecha (00:58:09). Por su parte, silvinasirollivettore informa que las órdenes de trabajo desde la 175 hasta la 178 son las que cargaron y ya se encuentran cerradas (00:59:21).

- **Cronograma de implementación y próximos pasos:** Luciano Correa Ribeiro detalla el plan de trabajo para los próximos días, proponiendo realizar las modificaciones necesarias para entregar la herramienta con los datos limpios el lunes, lo que otorgará un mes de trabajo para ajustar cualquier detalle que surja durante su uso (00:58:09). Luciano Correa Ribeiro indica que, una vez que el equipo empiece a utilizar la plataforma el lunes, se hará una semana de pausa en esa funcionalidad específica para enfocar la atención de la semana siguiente en el menú del taller externo. Para coordinar el proceso, Luciano Correa Ribeiro enviará un mensaje por WhatsApp el lunes, se retomará la reunión habitual el próximo miércoles y en dicho encuentro se centrará la discusión en el taller externo (00:59:21).

---

## Nota de edición (sin borrar contenido original)

Se conservó el texto de Gemini. Solo se **aclararon / precisaron** tramos alineados con lo trabajado en la app (login DNI/CUIT, alta usuario sin chofer, alta empresa sin Contacto/Tipo, orden de documentación y homologación sin fecha, vistas admin de documentación, asignación de flota por dueño). No se eliminaron ítems de la reunión ni se modificaron datos operativos del sistema.
