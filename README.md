# Pilotlane

Una plataforma web en español e inglés que conecta a founders con personas que prueban sus apps y aportan comentarios honestos. Nombre de trabajo: no se ha confirmado disponibilidad de marca o dominio.

Esta primera versión es funcional en **modo sandbox**. Permite crear cuentas, definir el público de un estudio, calcular un presupuesto, simular financiación, postular, aceptar testers, compartir invitaciones privadas, registrar actividad, entregar comentarios, revisar trabajo y simular recompensas. La aprobación de Google o Apple nunca es una condición de pago al tester.

El operador confirmó que trabaja desde **Chile como persona natural**, con cuentas de Mercado Pago y PayPal, sin cuenta Stripe. Los adaptadores implementados son Mercado Pago para cobros en CLP y PayPal Payouts para recompensas en USD. Están probados con contratos y transportes simulados; **no se han validado con esas cuentas reales**. La recaudación real permanece bloqueada hasta verificar la habilitación comercial, las tarifas, la conversión de moneda, la tesorería y la operación de reembolsos/disputas.

## Empezar

Requisitos: Node 24 y npm. No necesitas Docker, una base remota ni credenciales de pagos para desarrollar.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

La base local usa PostgreSQL embebido (PGlite), se crea en `.local/postgres` y aplica sus migraciones al primer acceso. `.env.local` y los datos locales están ignorados por Git. En producción se usa PostgreSQL con `DATABASE_URL`; no existe un fallback silencioso a datos locales.

```sh
npm run check
npm test
npm run build
npm run test:e2e
```

Las pruebas del navegador usan Chromium del sistema cuando está instalado; si falta, ejecuta `npx playwright install --with-deps chromium`. Los proyectos escritorio y móvil arrancan una compilación de producción y una base aislada. Las pruebas de tiempo utilizan un reloj inyectado en los servicios, nunca un endpoint público para saltarse días.

Para datos de ejemplo en tu propia cuenta de founder, después de registrarte:

```sh
npm run db:seed -- --owner=tu-correo-de-desarrollo
```

El seed solo funciona en sandbox, conserva estudios existentes y no crea contraseñas. Los ejemplos de la página pública son ilustrativos y están etiquetados como tales; no se presentan como actividad real.

## Arquitectura y harness

- [Contrato de producto](docs/specs/product.md): flujos, límites y criterios de aceptación.
- [Arquitectura](docs/specs/architecture.md): módulos, estados, autorización, HTTP y persistencia.
- [Economía](docs/specs/economics.md): comisión, reservas, monedas y condiciones de apertura real.
- [Verificación de proveedores](docs/research/provider-policies.md): fuentes y limitaciones de acceso.
- [Despliegue en Railway](docs/runbooks/railway.md): servicios, variables y pasos reproducibles.
- [Harness de validación](docs/runbooks/validation.md): qué verifica cada nivel y qué no se ha comprobado.

Next.js 16, React 19, TypeScript, Zod, PostgreSQL, Vitest y Playwright. Versiones exactas en el lockfile. Los servicios y las invariantes financieras se implementaron antes de la interfaz. El esquema SQL protege cupos, duplicados, límites de fondos y asientos contables balanceados e inmutables. La UI usa fuentes del sistema, iconos vectoriales y superficies discretas, sin ilustraciones generadas ni métricas inventadas.

Google OIDC es opcional y solo aparece cuando está configurado. Los accesos de tu navegador personal no se transfieren automáticamente al servidor ni al entorno de trabajo. No guardes secretos en el repositorio.

El contexto anterior del asistente de WhatsApp se conserva íntegro en `docs/archive/whatsapp-assistant.md`.
