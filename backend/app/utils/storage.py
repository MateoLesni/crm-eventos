"""
Utilidades para Google Cloud Storage
Manejo de comprobantes con signed URLs
"""
from google.cloud import storage
from google.auth import default as google_auth_default
from google.auth.transport import requests as google_auth_requests
from datetime import timedelta
import os

GCP_BUCKET_NAME = os.environ.get('GCP_BUCKET_COMPROBANTES', 'crm-eventos-comprobantes')

# Cache del cliente y credenciales para no recrearlos en cada request
_storage_client = None
_signing_credentials = None


def get_storage_client():
    global _storage_client
    if _storage_client is None:
        _storage_client = storage.Client()
    return _storage_client


def _get_signing_credentials():
    """
    Obtiene credenciales para firmar URLs.
    En Cloud Run no hay clave privada local, así que usamos
    IAM signBlob API via service_account_email + access_token.
    Refresca automáticamente si el token expiró.
    """
    global _signing_credentials
    if _signing_credentials is None:
        credentials, project = google_auth_default()
        _signing_credentials = credentials
    # Refrescar si no tiene token o si expiró
    if not _signing_credentials.valid:
        auth_request = google_auth_requests.Request()
        _signing_credentials.refresh(auth_request)
    return _signing_credentials


def generar_signed_url(blob_path, expiration_minutes=30):
    """
    Genera una signed URL temporal para un blob en el bucket.

    En Cloud Run (sin clave privada local), usa IAM signBlob API.
    Requiere rol 'Service Account Token Creator' en la service account.

    Args:
        blob_path: Path del blob (ej: 'comprobantes/216/4_abc.jpeg')
                   También acepta URLs completas legacy por retrocompatibilidad
        expiration_minutes: Minutos de validez (default 30)

    Returns:
        Signed URL temporal o None si no hay path
    """
    if not blob_path:
        return None

    # Retrocompatibilidad: si es una URL completa, extraer el blob path
    if blob_path.startswith('https://storage.googleapis.com/'):
        blob_path = blob_path.split(f'{GCP_BUCKET_NAME}/')[-1]

    try:
        client = get_storage_client()
        bucket = client.bucket(GCP_BUCKET_NAME)
        blob = bucket.blob(blob_path)

        # Obtener credenciales con service_account_email para Cloud Run
        signing_creds = _get_signing_credentials()

        url = blob.generate_signed_url(
            version='v4',
            expiration=timedelta(minutes=expiration_minutes),
            method='GET',
            service_account_email=signing_creds.service_account_email,
            access_token=signing_creds.token,
        )
        return url
    except Exception as e:
        import traceback
        print(f"Error generando signed URL para {blob_path}: {e}")
        traceback.print_exc()
        return None


def subir_archivo(file, filename, content_type=None):
    """
    Sube un archivo al bucket y retorna el blob path (NO la URL pública).

    Returns:
        str: blob path (ej: 'comprobantes/216/4_abc.jpeg')
    """
    client = get_storage_client()
    bucket = client.bucket(GCP_BUCKET_NAME)
    blob = bucket.blob(filename)
    blob.upload_from_file(file, content_type=content_type)
    return filename


def eliminar_archivo(blob_path):
    """
    Elimina un archivo del bucket.

    Args:
        blob_path: Path del blob o URL completa legacy
    """
    if not blob_path:
        return

    # Retrocompatibilidad: si es una URL completa, extraer el blob path
    if blob_path.startswith('https://storage.googleapis.com/'):
        blob_path = blob_path.split(f'{GCP_BUCKET_NAME}/')[-1]

    try:
        client = get_storage_client()
        bucket = client.bucket(GCP_BUCKET_NAME)
        blob = bucket.blob(blob_path)
        blob.delete()
    except Exception as e:
        print(f"Error eliminando archivo {blob_path}: {e}")


def enrich_pago_dict(pago_dict):
    """
    Enriquece un dict de pago con signed URL para el comprobante.
    Reemplaza comprobante_url (blob path) por una signed URL temporal.
    Si falla la generación, mantiene el valor original.
    """
    original_url = pago_dict.get('comprobante_url')
    if original_url:
        signed = generar_signed_url(original_url)
        if signed:
            pago_dict['comprobante_url'] = signed
        # Si signed es None, mantener original_url (mejor URL rota que None)
    return pago_dict
