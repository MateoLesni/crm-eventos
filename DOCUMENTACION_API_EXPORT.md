# API de Export del CRM — Guía para el Dashboard

Hola! Acá te dejo todo lo que necesitás para consumir los datos del CRM y armar el dashboard. Es una API REST de solo lectura, pensada para que puedas bajar todo el histórico una vez y después mantenerte sincronizado pidiendo solamente lo que cambió. Cualquier duda me escribís.

## Lo básico

- **URL base:** `https://crm-eventos-backend-656730419070.us-central1.run.app/api/export`
- **Autenticación:** en cada request tenés que mandar el header `X-API-Key` con la clave que te paso por privado (no la compartas ni la subas a ningún repo público, por favor).
- **Zona horaria:** todas las fechas y horas están en **hora argentina (UTC-3)**, en formato ISO (`2026-09-10T15:30:00`). No hay que convertir nada.
- **Formato:** JSON.

## Endpoints

### 1. `GET /ping` — para probar que estás conectado

Sirve para verificar que la key funciona y ver la hora del servidor.

```bash
curl "https://crm-eventos-backend-656730419070.us-central1.run.app/api/export/ping" \
  -H "X-API-Key: TU_API_KEY"
```

Respuesta:
```json
{
  "status": "ok",
  "server_time": "2026-09-10T13:06:53",
  "timezone": "America/Argentina/Buenos_Aires (UTC-3)"
}
```

### 2. `GET /eventos` — las tarjetas del pipeline

Este es el endpoint principal. Devuelve las tarjetas (eventos) con toda la info: datos del cliente, del evento, el vendedor asignado, el local, los montos y el estado en que está cada una.

**Parámetros:**

| Parámetro | Qué hace | Default |
|---|---|---|
| `limit` | Cuántas tarjetas devuelve por llamada. Máximo 500 (si pedís más, igual te doy 500). | 200 |
| `after_id` | Paginación: devuelve tarjetas con `id` mayor a este valor. Usá el `next_after_id` de la respuesta anterior. | 0 |
| `updated_since` | Devuelve solo tarjetas que cambiaron desde esa fecha/hora (ISO, hora argentina). | — |

**Respuesta:**

```json
{
  "eventos": [ ... ],
  "cantidad": 200,
  "has_more": true,
  "next_after_id": 1250,
  "server_time": "2026-09-10T13:07:04",
  "timezone": "America/Argentina/Buenos_Aires (UTC-3)"
}
```

- `has_more`: si es `true`, hay más páginas — pedí la siguiente con `after_id=next_after_id`.
- `server_time`: guardalo — es la fecha que vas a usar como `updated_since` en tu próxima sincronización.

**Cada evento viene así:**

```json
{
  "id": 1,
  "estado": "COTIZADO",
  "titulo": "PAX 100 — CoChinChina — Social",
  "tipo": "social",
  "canal_origen": "instagram",
  "fecha_evento": "2026-04-07",
  "horario_inicio": "20:00:00",
  "horario_fin": "02:00:00",
  "hora_consulta": "20:14:00",
  "cantidad_personas": 100,
  "presupuesto": 11000000.0,
  "fecha_presupuesto": "2026-02-20",
  "facturada": false,
  "es_prioritario": false,
  "es_tentativo": true,
  "motivo_rechazo": null,
  "mensaje_original": "Hola, quería averiguar para un evento...",
  "fecha_creacion": "2026-02-18T13:50:04",
  "fecha_actualizacion": "2026-03-19T14:29:58",
  "fecha_ultimo_cambio_estado": "2026-03-19T14:29:58",
  "local": { "id": 4, "nombre": "CoChinChina" },
  "vendedor": { "id": 3, "nombre": "Delfina Herrera", "email": "..." },
  "cliente": {
    "id": 1,
    "nombre": "Martina Vanderusten",
    "telefono": "5491168627634",
    "email": "...",
    "empresa": null,
    "notas": null,
    "fecha_creacion": "2026-02-18T13:50:04"
  }
}
```

**Los estados posibles de una tarjeta:** `CONSULTA_ENTRANTE`, `ASIGNADO`, `CONTACTADO`, `COTIZADO`, `APROBADO`, `RECHAZADO`, `MULTIRESERVA`, `CONCLUIDO`, `ELIMINADO`.

- `fecha_creacion` es cuando entró la consulta (se creó la tarjeta).
- `fecha_evento` es la fecha del evento en sí.
- `fecha_actualizacion` es la última vez que la tarjeta cambió (cualquier campo).
- `local` o `vendedor` pueden venir `null` si la tarjeta todavía no tiene asignado uno.

## Cómo tenés que consumirlo (importante)

La idea es que NO pidas todo el histórico cada vez que refresca tu dashboard. El flujo correcto es:

**Paso 1 — Carga inicial (una sola vez):**

Bajá todo el histórico paginando:

```
GET /eventos?limit=500&after_id=0
GET /eventos?limit=500&after_id=<next_after_id>
... hasta que has_more sea false
```

Guardá el `server_time` de la primera llamada.

**Paso 2 — Sincronización (cada vez que quieras actualizar):**

```
GET /eventos?updated_since=<el server_time que guardaste>&limit=500
```

Te van a venir solo las tarjetas que cambiaron desde entonces (normalmente un puñado). Actualizás esas en tu base local (upsert por `id`) y guardás el nuevo `server_time` para la próxima. Con sincronizar cada 5-10 minutos va sobrado para un dashboard.

Ojo: una tarjeta que ya tenías puede venir de nuevo en el incremental (porque cambió de estado, de monto, etc.). Siempre pisá la versión vieja con la nueva usando el `id` como clave.

## Límites (leelos, en serio)

Para cuidar la base de datos productiva, la API tiene estas protecciones y las aplica automáticamente:

- **Máximo 30 requests por minuto.** Si te pasás, recibís un `429` con el header `Retry-After` diciéndote cuántos segundos esperar. No insistas en loop: esperá y reintentá.
- **Máximo 500 filas por request.** `limit` mayor se capea solo.
- **Cache de 60 segundos:** si pedís exactamente lo mismo dos veces en menos de un minuto, la segunda respuesta puede ser la cacheada. Por eso no tiene sentido consultar más seguido que eso.
- **Sin key o key incorrecta:** `401`.

Si tu dashboard hace las cosas bien (carga inicial una vez + incrementales), nunca vas a tocar estos límites.

## Errores

| Código | Qué significa | Qué hacer |
|---|---|---|
| `401` | API key ausente o incorrecta | Revisá el header `X-API-Key` |
| `400` | Parámetro mal formado | El mensaje te dice cuál |
| `429` | Demasiadas requests | Esperá lo que diga `Retry-After` |
| `503` | Export deshabilitado | Avisame, es un tema de configuración nuestro |

## Qué NO está en esta API

Conversaciones de WhatsApp y Gmail, comprobantes de pago, datos de tesorería y presupuestos operativos internos. Si en algún momento necesitás algo más para el dashboard, hablémoslo y vemos si lo sumamos al contrato.

---

*Cualquier cosa que no funcione como dice acá, avisame directamente. — Mateo*
