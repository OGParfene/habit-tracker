# A tu ritmo · Habit tracker

Un espacio personal para registrar hábitos, retomar después de una pausa y entender el progreso. Interfaz en español, responsive y con funcionamiento sin conexión.

## Incluye

- Hoy: registro con un toque, cantidades reales, avances parciales, descansos y deshacer.
- Ejercicio con objetivo semanal, deporte y duración. Creatina, pasos, lectura y alimentación como hábitos iniciales editables.
- Hábitos personalizados, objetivos diarios o semanales, archivo y cambios efectivos desde hoy conservando objetivos anteriores.
- Historial editable de 14 días, selector para navegar a cualquier fecha pasada y notas diarias.
- Progreso por 7/30/90/365 días, mapas de constancia, tendencias semanales, cobertura, rachas y acumulados.
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

La aplicación compilada está en `dist/`. Se debe servir por HTTP(S); abrir `index.html` directamente no ejecuta los módulos. Las rutas relativas permiten desplegar en `/habit-tracker/`.

## Publicación en GitHub Pages

En Settings → Pages → Build and deployment, seleccionar **GitHub Actions**. El workflow `.github/workflows/pages.yml` ejecuta los tests y compila/publica `dist/` en los pushes a `main`. La página anterior puede seguir publicada hasta que se integre esta rama y termine el primer despliegue.

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
