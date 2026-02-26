"""
Utilidades para Google Cloud Storage
Manejo de comprobantes con signed URLs
"""
from google.cloud import storage
from datetime import timedelta
import os

GCP_BUCKET_NAME = os.environ.get('GCP_BUCKET_COMPROBANTES', 'crm-eventos-comprobantes')

# Cache del cliente para no recrearlo en cada request
_storage_client = None


def get_storage_client():
    global _storage_client
    if _storage_client is None:
        _storage_client = storage.Client()
    return _storage_client


def generar_signed_url(blob_path, expiration_minutes=30):
    """
    Genera una signed URL temporal para un blob en el bucket.

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

        url = blob.generate_signed_url(
            version='v4',
            expiration=timedelta(minutes=expiration_minutes),
            method='GET',
        )
        return url
    except Exception as e:
        print(f"Error generando signed URL para {blob_path}: {e}")
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
    """
    if pago_dict.get('comprobante_url'):
        pago_dict['comprobante_url'] = generar_signed_url(pago_dict['comprobante_url'])
    return pago_dict
