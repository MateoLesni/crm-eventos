# Documentacion Webhook - Evolution API hacia Backend CRM

## Resumen

Evolution API envia un POST a tu endpoint cada vez que ocurre un evento de WhatsApp.
El mismo endpoint recibe mensajes de TODAS las instancias (vendedoras).
La clave para identificar de que vendedora viene cada mensaje es el campo `instance`.

**Endpoint:** `POST /webhook/evolution`

---

## Instancias Configuradas

| Instancia | Vendedora | Numero | Estado |
|-----------|-----------|--------|--------|
| `whatsapp_nuevo` | Mateo (admin) | 5491156574088 | Conectado |
| `vendedora_juana` | Juana | 5491122905495 | Pendiente QR |
| `vendedora_delfina` | Delfina | 5491140504258 | Pendiente QR |
| `vendedora_traiana` | Traiana | 5491131642113 | Pendiente QR |

---

## Estructura del JSON que recibe el backend

### Evento: `messages.upsert` (Mensaje nuevo)

Este es el evento principal. Se dispara cada vez que se envia O recibe un mensaje en cualquiera de las instancias.

```json
{
  "event": "messages.upsert",
  "instance": "vendedora_juana",
  "data": {
    "key": {
      "remoteJid": "5491130093843@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0A0B1C2D3E4F5A6B7C8D9"
    },
    "pushName": "Juan Perez",
    "message": {
      "conversation": "Hola, quiero consultar por un evento"
    },
    "messageType": "conversation",
    "messageTimestamp": 1707398765,
    "instanceId": "46408998-cd35-4666-8ca5-88796b93448f",
    "source": "android"
  }
}
```

---

## Campos Importantes

### Nivel raiz

| Campo | Tipo | Descripcion | Ejemplo |
|-------|------|-------------|---------|
| `event` | string | Tipo de evento | `"messages.upsert"` |
| `instance` | string | **NOMBRE DE LA INSTANCIA (VENDEDORA)** | `"vendedora_juana"` |

### Dentro de `data`

| Campo | Tipo | Descripcion | Ejemplo |
|-------|------|-------------|---------|
| `data.key.remoteJid` | string | Numero del cliente (formato WhatsApp) | `"5491130093843@s.whatsapp.net"` |
| `data.key.fromMe` | boolean | **true** = vendedora envio, **false** = cliente envio | `false` |
| `data.key.id` | string | ID unico del mensaje (para evitar duplicados) | `"3EB0A0B1C2D3..."` |
| `data.pushName` | string | Nombre del contacto en WhatsApp | `"Juan Perez"` |
| `data.messageTimestamp` | integer | Unix timestamp del mensaje | `1707398765` |

### Dentro de `data.message` (contenido del mensaje)

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `data.message.conversation` | string | Mensaje de texto simple |
| `data.message.extendedTextMessage.text` | string | Mensaje con formato/link |
| `data.message.imageMessage.caption` | string | Pie de foto (imagen) |
| `data.message.audioMessage` | object | Mensaje de audio |
| `data.message.videoMessage.caption` | string | Pie de video |
| `data.message.documentMessage` | object | Documento adjunto |

---

## Como Identificar la Vendedora

### El campo `instance` es la clave

```python
data = request.get_json()
instance_name = data.get('instance')

# Mapeo instancia -> vendedora
VENDEDORAS = {
    'whatsapp_nuevo':     {'nombre': 'Mateo',    'numero': '5491156574088'},
    'vendedora_juana':    {'nombre': 'Juana',     'numero': '5491122905495'},
    'vendedora_delfina':  {'nombre': 'Delfina',   'numero': '5491140504258'},
    'vendedora_traiana':  {'nombre': 'Traiana',   'numero': '5491131642113'},
}

vendedora = VENDEDORAS.get(instance_name)
# vendedora = {'nombre': 'Juana', 'numero': '5491122905495'}
```

---

## Ejemplo Completo: Mensaje RECIBIDO por Juana

Un cliente le escribe a Juana:

```json
{
  "event": "messages.upsert",
  "instance": "vendedora_juana",
  "data": {
    "key": {
      "remoteJid": "5491130093843@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0A0B1C2D3E4F5A6B7C8D9"
    },
    "pushName": "Cliente Roberto",
    "message": {
      "conversation": "Hola Juana, quiero cotizar un evento para 200 personas"
    },
    "messageType": "conversation",
    "messageTimestamp": 1707398765
  }
}
```

**Interpretacion:**
- `instance` = `"vendedora_juana"` → El mensaje paso por el WhatsApp de **Juana**
- `fromMe` = `false` → El **cliente** le escribio a Juana
- `remoteJid` = `"5491130093843@s.whatsapp.net"` → Numero del cliente: **5491130093843**
- `pushName` = `"Cliente Roberto"` → Nombre del cliente en WhatsApp
- `conversation` = `"Hola Juana..."` → Texto del mensaje

---

## Ejemplo Completo: Mensaje ENVIADO por Juana

Juana responde al cliente desde su celular:

```json
{
  "event": "messages.upsert",
  "instance": "vendedora_juana",
  "data": {
    "key": {
      "remoteJid": "5491130093843@s.whatsapp.net",
      "fromMe": true,
      "id": "BAE5F6D7E8F9A0B1C2D3E4F5"
    },
    "pushName": "Juana",
    "message": {
      "conversation": "Hola Roberto! Si, tenemos disponibilidad. Te paso presupuesto."
    },
    "messageType": "conversation",
    "messageTimestamp": 1707398830
  }
}
```

**Interpretacion:**
- `instance` = `"vendedora_juana"` → Paso por el WhatsApp de **Juana**
- `fromMe` = `true` → **Juana** envio el mensaje
- `remoteJid` = `"5491130093843@s.whatsapp.net"` → Numero del cliente: **5491130093843**
- `conversation` = `"Hola Roberto!..."` → Texto de la respuesta de Juana

---

## Ejemplo: Mensaje RECIBIDO por Delfina

```json
{
  "event": "messages.upsert",
  "instance": "vendedora_delfina",
  "data": {
    "key": {
      "remoteJid": "5491145678901@s.whatsapp.net",
      "fromMe": false,
      "id": "CAE7G8H9I0J1K2L3M4N5O6P7"
    },
    "pushName": "Maria Lopez",
    "message": {
      "conversation": "Buenas tardes, necesito info sobre catering"
    },
    "messageType": "conversation",
    "messageTimestamp": 1707399000
  }
}
```

**Interpretacion:**
- `instance` = `"vendedora_delfina"` → Paso por el WhatsApp de **Delfina**
- `fromMe` = `false` → El **cliente** le escribio a Delfina

---

## Ejemplo: Mensaje con IMAGEN

```json
{
  "event": "messages.upsert",
  "instance": "vendedora_delfina",
  "data": {
    "key": {
      "remoteJid": "5491145678901@s.whatsapp.net",
      "fromMe": true,
      "id": "DAE8H9I0J1K2L3M4N5O6P7Q8"
    },
    "message": {
      "imageMessage": {
        "caption": "Aca te mando fotos del salon",
        "mimetype": "image/jpeg"
      }
    },
    "messageType": "imageMessage",
    "messageTimestamp": 1707399100
  }
}
```

---

## Evento: `messages.update` (Actualizacion de estado)

Se dispara cuando cambia el estado de un mensaje (enviado, entregado, leido).

```json
{
  "event": "messages.update",
  "instance": "vendedora_juana",
  "data": {
    "key": {
      "remoteJid": "5491130093843@s.whatsapp.net",
      "fromMe": true,
      "id": "BAE5F6D7E8F9A0B1C2D3E4F5"
    },
    "update": {
      "status": 3
    }
  }
}
```

**Valores de status:**
- `0` = ERROR
- `1` = PENDING (enviando)
- `2` = SERVER_ACK (enviado al servidor)
- `3` = DELIVERY_ACK (entregado al destinatario)
- `4` = READ (leido por el destinatario)
- `5` = PLAYED (reproducido, para audios/videos)

---

## Logica Recomendada para el Backend

```python
@app.route('/webhook/evolution', methods=['POST'])
def webhook_evolution():
    data = request.get_json()

    event = data.get('event')
    instance_name = data.get('instance')  # "vendedora_juana", "vendedora_delfina", etc.

    if event == 'messages.upsert':
        message_data = data.get('data', {})
        key = message_data.get('key', {})

        remote_jid = key.get('remoteJid')       # Numero del cliente
        from_me = key.get('fromMe', False)       # True=vendedora envio, False=cliente envio
        mensaje_id = key.get('id')               # ID unico del mensaje

        # Extraer numero del cliente (sin @s.whatsapp.net)
        numero_cliente = remote_jid.split('@')[0] if remote_jid else None

        # Nombre del contacto en WhatsApp
        push_name = message_data.get('pushName')

        # Timestamp
        timestamp = message_data.get('messageTimestamp', 0)

        # Extraer texto del mensaje
        message = message_data.get('message', {})
        texto = None
        tipo_mensaje = 'text'

        if 'conversation' in message:
            texto = message['conversation']
        elif 'extendedTextMessage' in message:
            texto = message['extendedTextMessage'].get('text', '')
        elif 'imageMessage' in message:
            tipo_mensaje = 'image'
            texto = message['imageMessage'].get('caption', '')
        elif 'audioMessage' in message:
            tipo_mensaje = 'audio'
        elif 'videoMessage' in message:
            tipo_mensaje = 'video'
            texto = message['videoMessage'].get('caption', '')
        elif 'documentMessage' in message:
            tipo_mensaje = 'document'

        # IDENTIFICAR VENDEDORA por instance_name
        # instance_name = "vendedora_juana" | "vendedora_delfina" | "whatsapp_nuevo"
        #
        # Opciones:
        # 1. Buscar en tabla de vendedoras por instance_name
        # 2. Usar mapeo fijo
        # 3. Guardar instance_name directamente en la tabla conversaciones

        # Guardar en BD...
        # El instance_name identifica de QUE VENDEDORA es la conversacion
        # El remote_jid identifica CON QUE CLIENTE es la conversacion
        # El from_me identifica QUIEN envio el mensaje (vendedora o cliente)

    elif event == 'messages.update':
        # Actualizar estado de lectura del mensaje
        pass

    return jsonify({'status': 'ok'}), 200
```

---

## Resumen de Identificacion

```
                    instance_name
                    (vendedora)
                         |
                         v
  Cliente  <------>  WhatsApp de Juana  -------> Backend CRM
  5491130093843      vendedora_juana             Guarda:
                     fromMe=false                - instance: vendedora_juana
                                                 - numero_cliente: 5491130093843
                                                 - fromMe: false (cliente envio)
                                                 - texto: "Hola..."
```

**Para saber DE QUE VENDEDORA es cada mensaje:** usa `instance`
**Para saber CON QUE CLIENTE es la conversacion:** usa `data.key.remoteJid`
**Para saber QUIEN envio el mensaje:** usa `data.key.fromMe`

---

## Tabla de Referencia Rapida

| Pregunta | Campo | Ejemplo |
|----------|-------|---------|
| ¿De que vendedora es? | `instance` | `"vendedora_juana"` |
| ¿Que cliente es? | `data.key.remoteJid` | `"5491130093843@s.whatsapp.net"` |
| ¿Quien envio? | `data.key.fromMe` | `true`=vendedora, `false`=cliente |
| ¿Que dice el mensaje? | `data.message.conversation` | `"Hola, quiero info"` |
| ¿ID unico del mensaje? | `data.key.id` | `"3EB0A0B1C2D3..."` |
| ¿Cuando se envio? | `data.messageTimestamp` | `1707398765` (Unix) |
| ¿Nombre del contacto? | `data.pushName` | `"Juan Perez"` |
| ¿Tipo de mensaje? | `data.messageType` | `"conversation"`, `"imageMessage"` |
