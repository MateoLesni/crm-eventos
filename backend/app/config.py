import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-cambiar-en-prod')

    # MySQL Cloud SQL
    DB_USER = os.getenv('DB_USER', 'root')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = os.getenv('DB_PORT', '3306')
    DB_NAME = os.getenv('DB_NAME', 'crm_eventos')

    # Cloud SQL Instance Connection Name (para Cloud Run)
    CLOUD_SQL_CONNECTION_NAME = os.getenv('CLOUD_SQL_CONNECTION_NAME', '')

    # Si estamos en Cloud Run (tiene CLOUD_SQL_CONNECTION_NAME), usar socket Unix
    # Si no, usar conexión TCP normal (desarrollo local)
    if CLOUD_SQL_CONNECTION_NAME:
        SQLALCHEMY_DATABASE_URI = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@/{DB_NAME}?unix_socket=/cloudsql/{CLOUD_SQL_CONNECTION_NAME}"
    else:
        SQLALCHEMY_DATABASE_URI = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # CORS - URLs permitidas (configurar en Cloud Run)
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(',')
