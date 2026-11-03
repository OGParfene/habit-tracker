# A tu ritmo · Habit tracker

Un espacio personal para registrar hábitos, retomar después de una pausa y entender el progreso. Interfaz en español, responsive y con funcionamiento sin conexión.

## Incluye

- Hoy: registro con un toque, cantidades reales, avances parciales, descansos y deshacer.
- Ejercicio con objetivo semanal y múltiples actividades por día, cada una con duración opcional, eliminación y deshacer. Puedes añadir actividades después de completar el hábito sin contarlo varias veces. Los deportes históricos se conservan. Creatina, pasos, lectura y alimentación como hábitos iniciales editables.
- Hábitos personalizados, objetivos diarios o semanales, archivo y cambios efectivos desde hoy conservando objetivos anteriores.
- Historial mensual con calendario, vista del día seleccionado, notas y edición explícita con vuelta al historial.
- Progreso por 7/30/90/365 días con totales en sus unidades, actividades y días separados, objetivos semanales por días y detalle de estados con calendarios fechados. Todos los datos del detalle usan el periodo seleccionado; las rachas de todo el historial se identifican aparte.
- Migración automática de `calendarData` sin borrar el original. Las cantidades históricas desconocidas no se inventan.
- Exportación JSON y CSV, importación con combinación por fecha de modificación y descarga previa de una copia.
- PWA instalable con recursos precargados para uso sin conexión.
- Recordatorio diario descargable en formato ICS para el calendario.
- Integración opcional con Supabase Auth y sincronización por registro con aislamiento por usuario.

## Desarrollo

Requiere Node 22 o posterior.

```sh
npm ci
npm run dev
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

Para desarrollo, abre `/app.html`. La aplicación compilada está en `dist/`. Se debe servir por HTTP(S); abrir `index.html` directamente no ejecuta los módulos. Las rutas relativas permiten desplegar en `/habit-tracker/`.

## Publicación en GitHub Pages

Se mantiene Pages en **Deploy from a branch → main → / (root)**. El workflow `.github/workflows/pages.yml` ejecuta los tests y verifica los compilados en cada PR y push a `main`. El sitio existente usa `main` y la raíz del repositorio. `app.html` es la plantilla fuente; `index.html`, `assets/`, `sw.js`, `cloud-config.json`, `icon.svg` y `manifest.webmanifest` son archivos compilados. No editar los compilados manualmente. Antes de cada commit con cambios, ejecutar `npm run build:pages` e incluir los compilados. Pages publica el commit de `main` sin cambiar la configuración de hosting.

## Supabase (opcional)

La app funciona localmente si `public/cloud-config.json` tiene campos vacíos. Para activar sincronización:

1. Crear un proyecto dedicado y revisar su coste antes de contratarlo.
2. Ejecutar `supabase/schema.sql` en el proyecto. Contiene RLS y una función invoker: cada cuenta accede únicamente a sus filas. No se usan claves secretas en el navegador.
3. En Auth → URL Configuration, establecer Site URL y Redirect URLs a `https://ogparfene.github.io/habit-tracker/` (y localhost solo para desarrollo).
4. Configurar el envío de email de Supabase según las restricciones del plan. En producción conviene configurar SMTP propio; el proveedor por defecto limita destinatarios y volumen.
5. Rellenar `public/cloud-config.json` con `url` y `publishableKey`. Esta clave es pública; nunca incluir `service_role` o secret keys.
6. Compilar y desplegar. En Ajustes, iniciar sesión mediante enlace al correo. El historial sin cuenta se incorpora solo al pulsar «Incorporar historial local».

Los registros se guardan en `rhythm-v2` sin cuenta y `rhythm-v2-<user-id>` con cuenta. Al salir se vuelve al historial local. Las modificaciones offline se sincronizan al volver la conexión o abrir la app. En conflictos del mismo registro gana la fecha de edición más reciente; el reloj del dispositivo debe ser correcto. Los borrados se sincronizan como tombstones. Dos dispositivos pueden editar hábitos o días distintos sin reemplazar el historial completo.

## Interpretación de estadísticas

- **Completado:** sí/no confirmado, cantidad igual o superior al objetivo, o valoración registrada. En alimentación, registrar una valoración no equivale a «comer bien».
- **Parcial:** cantidad positiva por debajo del objetivo. No se considera fracaso ni cumplimiento completo.
- **Sin registrar:** desconocido, diferente de «no realizado».
- **Cobertura:** registros explícitos / días elegibles, excluidos descansos. Los desconocidos quedan en el denominador del cumplimiento, y se muestran aparte.
- Los días futuros y anteriores a la creación del hábito no cuentan. Los descansos no rompen rachas diarias.
- Los hábitos semanales muestran objetivos por semana; una semana actual incompleta no rompe una racha previa. Las semanas iniciales/parciales se identifican en el detalle.
- Los datos históricos booleanos cuentan como completados sin añadir cantidades inventadas.

## Límites

Los recordatorios son eventos de calendario, no push de la web. No hay lectura automática de Apple Health/Google Fit. La sincronización requiere configurar y probar el proyecto Supabase y el correo. El almacenamiento local depende del navegador: exporta copias periódicas. La sincronización no elimina las copias ya descargadas o guardadas en otros dispositivos.

## Identidad visual

Monograma vectorial P de Parfene, con un trazo continuo y un punto que representa el siguiente paso. Base marfil e índigo; terracota para ejercicio, turquesa para caminar, azul para lectura, violeta para creatina y frambuesa para alimentación. Son asociaciones visuales para identificar las actividades y dar coherencia, sin promesas de efectos psicológicos. El logo está en `public/icon.svg` y se publica también como favicon y símbolo de la aplicación.

## Lectura de progreso e historial

El resumen cuenta días con algún hábito o nota registrados. Cada hábito muestra cantidades reales (pasos, minutos, actividades o valoraciones) y distingue explícitamente completado, parcial, no realizado, descanso y sin registrar. Los registros antiguos sin cantidad no añaden unidades inventadas. Los objetivos semanales se miden en días completados y el listado solo compara semanas completas del periodo. Las rachas se consultan de forma secundaria y se rotulan como calculadas hasta hoy sobre todo el historial.

En móvil, los campos de entrada usan al menos 16 px para evitar el zoom automático de Safari; no se restringe el zoom manual. Al guardar se retira el foco del campo.

## Gráficos del progreso

Cada hábito incorpora una visualización interactiva en la tarjeta y en su detalle. Pasos y lectura muestran cantidades; ejercicio y hábitos sí/no muestran días completados, contando un solo día aunque haya varias actividades. Alimentación usa un gráfico de distribución de las valoraciones anotadas. Toca una barra o enfócala con el teclado para consultar la fecha, cantidad y datos ausentes; también hay una tabla de datos desplegable.

Hasta 31 días se dibujan barras diarias; hasta 100, totales semanales; y para periodos mayores, totales mensuales. Los días sin cantidad se conservan como datos ausentes, diferentes de un cero registrado. Las líneas de objetivo usan la meta histórica del día o de una semana completa; no se inventan objetivos para bloques parciales ni cantidades para marcas antiguas. Los gráficos utilizan SVG local, sin servicios de IA ni nuevos costes o cuentas.
