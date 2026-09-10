# Doc API Export CRM

Buenas! Esta es la doc para consumir los datos del CRM para el dashboard. Cualquier duda me escribís +5491156574088

La idea general es que es una API de solo lectura. Bajás todo el histórico una vez, y después vas pidiendo solo lo que cambió. Abajo te explico el flujo.

# Básico

- URL base: `https://crm-eventos-backend-656730419070.us-central1.run.app/api/export`
- En todas las requests va el header `X-API-Key` con la clave que te paso por privado (no la subas a ningún repo ni la compartas)
- Todas las fechas/horas van en hora argentina, formato ISO tipo `2026-09-10T15:30:00`. No hay que convertir nada de UTC ni esas cosas.

# Para probar que estés conectado

```bash
curl "https://crm-eventos-backend-656730419070.us-central1.run.app/api/export/ping" \
  -H "X-API-Key: TU_API_KEY"
```

Si te devuelve `status: ok` con la hora del server, estaria bien. Si te da 401 es la key.

# El endpoint principal: /eventos

`GET /eventos` te devuelve las tarjetas del pipeline con todo: cliente, evento, vendedor, local, montos y el estado en que está cada una.

Parámetros:

| Parámetro | Qué hace |
|---|---|
| `limit` | cuántas tarjetas por llamada, máximo 500 (default 200) |
| `after_id` | para paginar, devuelve las de id mayor a ese valor |
| `updated_since` | solo las tarjetas que cambiaron desde esa fecha (ISO, hora argentina) |

La respuesta viene así:

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

Si `has_more` es true, pedís la página siguiente con `after_id=next_after_id`. Y el `server_time` guardalo que es tu próximo `updated_since` (después se entiende).

Cada evento tiene esta pinta:

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

Aclaraciones sueltas que te van a servir:

- Los estados posibles son: CONSULTA_ENTRANTE, ASIGNADO, CONTACTADO, COTIZADO, APROBADO, RECHAZADO, MULTIRESERVA, CONCLUIDO, ELIMINADO
- `fecha_creacion` es cuando entró la consulta (o sea cuando se creó la tarjeta), `fecha_evento` es la fecha del evento en sí. No confundir.
- `fecha_actualizacion` es la última vez que se tocó la tarjeta, lo que sea
- `local` o `vendedor` pueden venir null si la tarjeta todavía no los tiene asignados, tenelo en cuenta en tu código
- el presupuesto viene como número, en pesos

# Cómo consumirlo bien

Esto es lo importante. NO quiero que el dashboard pida todo el histórico cada vez que refresca, para eso está el modo incremental.

Primera vez (una sola vez en la vida):

```
GET /eventos?limit=500&after_id=0
GET /eventos?limit=500&after_id=<el next_after_id que te vino>
... y así hasta que has_more venga false
```

Guardate el server_time de la primera llamada.

De ahí en adelante, cada vez que quieras refrescar:

```
GET /eventos?updated_since=<el server_time que guardaste>&limit=500
```

Te vienen solo las tarjetas que cambiaron desde entonces (normalmente son pocas o ninguna). Las pisás en tu base local usando el `id` como clave (upsert), guardás el server_time nuevo y listo. Sincronizando cada 5 o 10 minutos va más que sobrado para un dashboard.

Ojo que en el incremental te puede venir una tarjeta que ya tenías (porque cambió de estado, de monto, lo que sea). Siempre pisá la vieja con la nueva.

# Límites

La base es la productiva del CRM así que le puse límites, los aplica el servidor solo:

- máximo 30 requests por minuto → si te pasás recibís un 429 con el header `Retry-After` que te dice cuántos segundos esperar. No reintentes en loop, esperá y volvé a probar.
- máximo 500 filas por request, si pedís más se capea solo
- hay un cache de 60 segundos, si pedís lo mismo dos veces seguidas la segunda puede salir del cache. Por eso tampoco tiene sentido consultar más seguido que eso.

Si hacés el flujo como te expliqué arriba no vas a tocar ninguno de estos límites nunca.

Errores que te podés encontrar: 401 es la key (revisá el header), 400 es un parámetro mal formado (el mensaje te dice cuál), 429 es que te pasaste de requests, y si ves un 503 avisame que es un tema de config nuestro.


Con esta info te deberías poder manejar pero, cualquier cosa me escribís.

Mateo
