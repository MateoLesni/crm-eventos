# Deploy CRM Eventos en Google Cloud Run

## Requisitos previos
- Google Cloud SDK instalado
- Proyecto de GCP creado
- APIs habilitadas: Cloud Run, Cloud Build, Container Registry

## Variables de entorno necesarias (NO SUBIR A GIT)

### Backend
```
DB_HOST=34.63.29.155
DB_USER=bd-crm-eventos
DB_PASSWORD=<tu-password>
DB_NAME=bd_crm_eventos
SECRET_KEY=<generar-clave-secreta-larga>
CORS_ORIGINS=https://crm-eventos-frontend-xxxxx.run.app
```

### Frontend
```
VITE_API_URL=https://crm-eventos-backend-xxxxx.run.app/api
```

## Pasos para deploy

### 1. Configurar proyecto de GCP
```bash
gcloud config set project TU_PROJECT_ID
gcloud auth login
```

### 2. Habilitar APIs
```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### 3. Deploy del Backend (primero)
```bash
gcloud builds submit --config=cloudbuild-backend.yaml \
  --substitutions=_DB_HOST="34.63.29.155",_DB_USER="bd-crm-eventos",_DB_PASSWORD="TU_PASSWORD",_DB_NAME="bd_crm_eventos",_SECRET_KEY="TU_SECRET_KEY",_CORS_ORIGINS="https://crm-eventos-frontend-xxxxx.run.app"
```

O deploy manual:
```bash
cd backend
gcloud run deploy crm-eventos-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "DB_HOST=34.63.29.155,DB_USER=bd-crm-eventos,DB_PASSWORD=TU_PASSWORD,DB_NAME=bd_crm_eventos,SECRET_KEY=TU_SECRET_KEY,CORS_ORIGINS=*"
```

### 4. Obtener URL del backend
```bash
gcloud run services describe crm-eventos-backend --region us-central1 --format='value(status.url)'
```

### 5. Deploy del Frontend (después de tener URL del backend)
```bash
gcloud builds submit --config=cloudbuild-frontend.yaml \
  --substitutions=_API_URL="https://crm-eventos-backend-xxxxx.run.app/api"
```

O deploy manual:
```bash
cd frontend
# Primero crear el archivo .env.production
echo "VITE_API_URL=https://crm-eventos-backend-xxxxx.run.app/api" > .env.production
npm run build
gcloud run deploy crm-eventos-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

### 6. Actualizar CORS del backend
Una vez tengas la URL del frontend, actualiza la variable CORS_ORIGINS:
```bash
gcloud run services update crm-eventos-backend \
  --region us-central1 \
  --set-env-vars "CORS_ORIGINS=https://crm-eventos-frontend-xxxxx.run.app"
```

## URLs finales

- **Frontend**: https://crm-eventos-frontend-xxxxx.run.app
- **Backend API**: https://crm-eventos-backend-xxxxx.run.app/api

## Endpoint para N8N

Una vez desplegado, darle a tu compañero de N8N:

```
POST https://crm-eventos-backend-xxxxx.run.app/api/eventos
POST https://crm-eventos-backend-xxxxx.run.app/api/eventos/asignar-por-respuesta
```

## Importante: Seguridad

- NUNCA subir el archivo .env a Git
- Las variables sensibles se configuran directamente en Cloud Run
- El archivo .gitignore ya está configurado para ignorar .env
