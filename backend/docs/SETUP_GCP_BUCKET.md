# Configuracion de GCP Bucket para Comprobantes

## 1. Crear el Bucket

En Cloud Shell o con gcloud CLI:

```bash
# Crear bucket (reemplazar PROJECT_ID)
gsutil mb -l us-central1 gs://crm-eventos-comprobantes

# Configurar CORS para permitir uploads desde el frontend
cat > cors.json << 'EOF'
[
  {
    "origin": ["https://crm-eventos-frontend-656730419070.us-central1.run.app", "http://localhost:5173"],
    "method": ["GET", "POST", "PUT", "DELETE"],
    "responseHeader": ["Content-Type", "Authorization"],
    "maxAgeSeconds": 3600
  }
]
EOF

gsutil cors set cors.json gs://crm-eventos-comprobantes
```

## 2. Configurar Permisos

```bash
# Dar permisos al service account de Cloud Run
# (El service account ya deberia tener permisos si es el default)

# Si necesitas permisos publicos para lectura:
gsutil iam ch allUsers:objectViewer gs://crm-eventos-comprobantes
```

## 3. Agregar Variable de Entorno en Cloud Run

```bash
gcloud run services update crm-eventos-backend \
  --set-env-vars="GCP_BUCKET_COMPROBANTES=crm-eventos-comprobantes" \
  --region=us-central1
```

## 4. Instalar dependencia google-cloud-storage

Ya deberia estar en requirements.txt, pero verificar:

```bash
pip install google-cloud-storage
```

Agregar a requirements.txt si no esta:
```
google-cloud-storage==2.14.0
```

## 5. Estructura de archivos en el bucket

Los comprobantes se guardan con esta estructura:
```
comprobantes/
  {evento_id}/
    {pago_id}_{uuid}.{extension}
```

Ejemplo:
```
comprobantes/
  123/
    45_a1b2c3d4.pdf
    46_e5f6g7h8.jpg
```
