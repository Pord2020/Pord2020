# CLAUDE.md — Asistente de WhatsApp para vendedores informales

> Este documento es la fuente de verdad del proyecto. Define qué estamos
> construyendo, para quién, cómo se comporta el producto y bajo qué
> decisiones técnicas. Mantenerlo actualizado a medida que el proyecto
> evoluciona.

---

## 1. Visión del producto

Un **asistente con IA que vive dentro de WhatsApp** y ayuda a vendedores
informales a llevar su negocio: inventario, ventas, fiados (créditos a
clientes), su presupuesto de compra de mercadería, recordatorios y
reportes. El vendedor le habla por **texto, fotos y notas de voz**, y el
asistente le responde como si todo lo hubiera escrito él mismo: de forma
clara, conversacional y resolutiva.

**Por qué existe:** hoy estos vendedores llevan todo "a lápiz y papel" o
"al ojo", sin números claros. El asistente reemplaza el cuaderno con una
herramienta que ya conocen y usan a diario: WhatsApp.

**El producto es 98% WhatsApp.** Todo el valor ocurre en el chat. El 2%
restante es una app Android mínima (ver sección de Arquitectura).

---

## 2. Usuario objetivo

- **Vendedor informal en Chile.** Puesto informal o formal, ambulante,
  ventas por redes sociales. Ese es el core, pero el producto puede
  escalar a más público.
- **Perfil típico:** persona de **50+ años**, economía modesta,
  **analfabeto digital**. Por eso TODO es por WhatsApp: es la única
  herramienta que domina.
- **Un solo usuario por negocio.** No hay equipos ni cuentas compartidas
  (al menos por ahora).
- **Identidad = número de teléfono de WhatsApp.**

**Implicancia de diseño #1:** la simplicidad no es opcional. Nada de
formularios, menús rígidos ni jerga técnica. Todo conversacional, paso a
paso, con paciencia.

---

## 3. Personalidad y tono del bot

- **Idioma:** español **neutro**. La app es para Chile, pero **sin
  modismos** (ni chilenismos ni de otros países).
- **Tono:** educado, diligente, resolutivo. **Sin ser condescendiente.**
  Trata al usuario como un adulto capaz.
- **Estilo:** conversacional y abierto. **Nunca** respuestas cerradas tipo
  "elige opción 1, 2 o 3". El bot entiende lenguaje libre y se adapta a lo
  que el usuario pide.
- **Cálido pero directo.** Mensajes cortos y comprensibles (el usuario es
  mayor): entre más simple, mejor.
- **Sin nombre aún.** El producto todavía no tiene marca/nombre definido.

---

## 4. Dominio del negocio (qué hace el asistente)

### 4.1 Onboarding guiado
Cuando un usuario nuevo escribe por primera vez, el bot lo **guía paso a
paso**: saludo cálido + preguntas muy simples para conocer su negocio y
empezar a armar su inventario poco a poco. Nada de formularios.

### 4.2 Inventario
- Datos por producto: **nombre, precio de costo, precio de venta,
  cantidad/stock, unidad** (unidad, kilo, paquete, etc.).
- **El precio de costo es opcional** (ver Ventas/Ganancia).
- Al registrar una venta, **el stock se descuenta automáticamente**.
- El usuario puede **cargar productos nuevos** en cualquier momento,
  incluso enviando una **foto** de la mercadería que compró.

### 4.3 Ventas
- El usuario dice, por ejemplo, "vendí 3 panes a 500".
- El bot **anota y avisa** lo que registró (no pide confirmación previa
  rígida; registra y notifica). Si el usuario se equivoca, **lo corrige**
  y el bot **hace los cambios** (editar/borrar registros).
- **Ganancia (flexible):**
  - Si el usuario **no** dio precio de costo → el bot muestra solo el
    **total vendido**.
  - Si el producto tiene precio de costo y venta → el bot muestra
    **cuánto vendió y cuánto ganó**.

### 4.4 Fiado (crédito a clientes)
- El bot lleva la cuenta de **cuánto debe cada cliente**.
- Cliente identificado por **nombre o apodo** que dice el vendedor
  ("le fié a la señora Rosa").
- Registra **abonos y pagos parciales** y muestra el **saldo**.
- **Recuerda** los fiados pendientes (ver Recordatorios).

### 4.5 Presupuesto de compra (del vendedor)
> **Importante:** "presupuesto" aquí NO es una cotización para clientes.
> Es el dinero que el **vendedor** tiene para comprar mercadería.

- El vendedor define un monto ("tengo $50.000 para comprar mercadería").
- El bot **descuenta cada compra** que registra y le avisa **cuánto le
  queda**.
- El bot puede **sugerir qué reponer** según lo que más se vende.

### 4.6 Recordatorios y tareas programadas
Soporta **ambos** modos:
- **A pedido del usuario:** "recuérdame mañana comprar harina".
- **Proactivos del bot:** resumen del día en la noche, aviso de stock
  bajo, aviso de fiados antiguos, etc.

### 4.7 Reportes y consultas
- Por ahora **solo texto** (simple y comprensible).
- Conversacional, comprensivo, **nunca rígido**. Responde lo que el
  usuario pide, no menús cerrados.
- Ejemplos: "¿cuánto vendí hoy?", "¿quién me debe?", "¿qué es lo que más
  vendo?".

### 4.8 Multimedia (texto, voz, foto)
- **Voz:** son instrucciones habladas. El bot transcribe/entiende y
  responde **como si el usuario lo hubiera escrito**. Nada más.
- **Foto:** muchos usos y muy diversos, por ejemplo:
  - Foto de productos comprados → agregarlos al inventario.
  - Foto del total de productos a la venta → calcular total por vender.
  - Foto de un papel/recibo con cuentas a mano → interpretarlo.
- **Texto:** lenguaje libre, el bot interpreta la intención.

---

## 5. Modelo de negocio

- **Freemium + suscripción mensual.**
- **Precio:** **$3.000 CLP / mes**.
- **Prueba gratis:** **15 días** al inicio.
- **Plan gratis (free):**
  - Límite de **consultas diarias** (por definir, ~3/día).
  - **Sin fotos.** Si un usuario free envía una foto, el bot responde
    **amablemente** que esa función es para usuarios de pago.
  - Solo **texto y audio**.
- **Plan de pago (Pro):** acceso completo, incluidas fotos.
- **Pagos:**
  - **Mercado Pago:** el usuario recibe un **link de pago en el chat**.
    Por ahora la activación a Pro es **manual**; al escalar se automatiza
    (webhook de Mercado Pago → backend activa Pro).
  - **Google Play (Android):** si paga desde la app, se activa Pro desde
    el backend.

---

## 6. Arquitectura técnica

### 6.1 Componentes
- **Backend:** **Node.js + NestJS** (TypeScript). Es el cerebro de todo.
- **Base de datos:** **PostgreSQL en Railway** (proveedor de hosting/BD).
- **IA:** **Google Gemini** con **function calling / tools** (ver 6.2).
- **WhatsApp:** **Kapso** como plataforma de mensajería (entrada/salida de
  mensajes, multimedia). *La forma exacta del flujo está por revisar e
  iterar (ver 6.3).*
- **App Android (el 2%):** en **Kotlin**, Android primero. Hace **solo dos
  cosas**:
  1. Botón para **abrir WhatsApp** y empezar a hablar con el bot.
  2. Botón para **pagar la suscripción**.
  - La app es **opcional**: la gente también puede llegar al bot
    directamente por WhatsApp (alguien le pasa el número) y pagar vía link
    de Mercado Pago en el chat.
- **Pagos:** Mercado Pago (link en chat) + Google Play Billing (app).

### 6.2 El "cerebro": Gemini con function calling
- El modelo entiende lenguaje libre y lo traduce en **acciones concretas**
  ejecutadas por el backend mediante **tools / function calling**, por
  ejemplo: `registrar_venta`, `agregar_producto`, `descontar_stock`,
  `registrar_fiado`, `registrar_abono`, `registrar_compra`,
  `crear_recordatorio`, `consultar_reporte`, etc.
- **El backend ejecuta las acciones**; el modelo decide cuál y con qué
  argumentos. Las operaciones de plata/stock las hace nuestro código de
  forma determinística, no el modelo "a ojo".
- **Modelo:** el más reciente disponible. A junio 2026 la referencia es
  **Gemini 3.5 Flash**. **Debe ser configurable en un solo lugar**
  (variable de entorno `GEMINI_MODEL`) para actualizarlo fácil.
- **Multimodal:** Gemini procesa **audio** (transcripción/intención) e
  **imágenes** (interpretar fotos de productos, recibos, papeles).

### 6.3 Flujo Kapso (por iterar)
Aún no está 100% definido cómo se reparte el trabajo con Kapso. Diseño
propuesto, **modular** para poder cambiar de proveedor:

1. Kapso recibe el mensaje de WhatsApp (texto/audio/foto) y dispara un
   **webhook** al backend.
2. El backend manda **audio/imagen a Gemini** para transcribir/interpretar.
3. Gemini decide la acción (function calling) → backend ejecuta sobre la BD.
4. El backend genera la respuesta y la envía de vuelta por **Kapso**.

> Esta capa debe quedar **abstraída** (interfaz de "canal de mensajería")
> para no acoplarnos a Kapso.

### 6.4 Memoria y contexto
- **Memoria enfocada en el negocio + contexto reciente** de la
  conversación.
- **No memorizar datos volátiles** (ej. "cuántos martillos tiene"). Esos
  se **consultan a la BD en tiempo real** cuando el usuario pregunta.
- La BD es la fuente de verdad de inventario, ventas, fiados y presupuesto.

---

## 7. Seguridad y privacidad (prioridad alta)

- Manejamos **dinero y datos de clientes** → seguridad estricta **desde el
  día 1**.
- **Cumplimiento legal:** considerar la **nueva Ley de Protección de Datos
  de Chile** (Ley N° 21.719), que entra en vigencia en **diciembre de
  2026**. Diseñar pensando en: consentimiento, finalidad, minimización de
  datos, derechos del titular (acceso, rectificación, supresión) y deber
  de seguridad.
- **Datos cifrados** (en tránsito y en reposo) y **respaldados** desde ya.
- Minimizar la recolección de datos personales a lo estrictamente
  necesario para operar el negocio del vendedor.

---

## 8. Comportamiento esperado del bot (resumen de reglas)

1. **Conversacional siempre.** Nunca menús rígidos ni "elige una opción".
2. **Anota y avisa.** Registra la acción y notifica qué hizo; el usuario
   corrige si algo está mal y el bot aplica los cambios.
3. **Español neutro, educado, sin condescendencia, sin modismos.**
4. **Simple.** Mensajes cortos y claros (usuario mayor, analfabeto
   digital).
5. **Free vs Pro.** Respetar límites del plan free (consultas/día, sin
   fotos) con avisos amables.
6. **La BD manda.** Para datos exactos, consultar la base, no "recordar".

---

## 9. Convenciones de desarrollo

- **Estilo de trabajo:** desarrollo **autónomo**. Se propone y construye la
  arquitectura, explicando cada bloque en lenguaje claro; se consulta al
  dueño del producto solo ante **decisiones de negocio o de dinero**.
- **Backend:** TypeScript + NestJS, arquitectura modular por dominio
  (inventario, ventas, fiados, presupuesto, recordatorios, mensajería, IA,
  suscripciones).
- **App:** Kotlin (Android).
- **Pruebas automáticas desde el inicio** para que nada se rompa al crecer.
- **Configuración por variables de entorno** (`.env`), con **mocks** para
  Kapso, Gemini, Mercado Pago y Railway de modo que el sistema corra y se
  pueda probar localmente sin credenciales reales. (El dueño ya tiene las
  credenciales; se conectan sin reescribir código.)
- **Idioma del código:** nombres de dominio pueden ir en español
  (`registrarVenta`, `fiado`, `presupuesto`) para reflejar el negocio;
  comentarios claros.
- **Commits** descriptivos. Rama de desarrollo: `claude/repo-overview-xbpesu`.

---

## 10. Glosario

- **Fiado:** venta a crédito; deuda que un cliente tiene con el vendedor.
- **Abono:** pago parcial de un fiado.
- **Presupuesto:** dinero que el **vendedor** tiene para comprar
  mercadería (NO una cotización a clientes).
- **Free / Pro:** plan gratuito (limitado) y plan de pago.
- **Kapso:** plataforma usada para enviar/recibir mensajes de WhatsApp.
- **CLP:** peso chileno (sin decimales).

---

## 11. Estado actual y próximos pasos

**Estado:** repositorio recién iniciado. Este `CLAUDE.md` es el primer
artefacto: define el contexto del proyecto.

**Próximos pasos sugeridos:**
1. Definir el límite exacto de consultas diarias del plan free.
2. Investigar e iterar el flujo real de Kapso (multimedia, webhooks).
3. Scaffolding del backend NestJS + modelo de datos (PostgreSQL).
4. Capa de IA con Gemini (function calling) y sus tools de dominio.
5. Integración de mensajería (abstracción + Kapso) con mocks.
6. Suscripciones (Mercado Pago link + activación manual; Google Play).
7. App Android mínima en Kotlin (dos botones).
8. Seguridad/cifrado/respaldos y checklist de Ley 21.719.
