import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BASE_DIR.parent


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or key in os.environ:
            continue
        if value and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


load_env_file(REPO_ROOT / ".env")
load_env_file(BASE_DIR / ".env")


def require_strong_jwt_signing_key(secret_key: str, jwt_signing_key: str, *, debug: bool) -> str:
    if debug:
        return jwt_signing_key
    if not jwt_signing_key or jwt_signing_key == "change-me":
        raise ImproperlyConfigured("JWT_SIGNING_KEY must be set to a strong non-default value when DEBUG is False.")
    if jwt_signing_key == secret_key:
        raise ImproperlyConfigured("JWT_SIGNING_KEY must not reuse DJANGO_SECRET_KEY when DEBUG is False.")
    return jwt_signing_key


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "change-me")
DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() == "true"
JWT_SIGNING_KEY = os.getenv("JWT_SIGNING_KEY", SECRET_KEY)
ALLOWED_HOSTS = [host.strip() for host in os.getenv("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost").split(",") if host.strip()]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "drf_spectacular",
    "django_filters",
    "accounts",
    "core",
    "cmdb",
    "audit",
    "automation",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "core.middleware.RequestIDMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.getenv("MYSQL_DATABASE", "app_db"),
        "USER": os.getenv("MYSQL_USER", "app_user"),
        "PASSWORD": os.getenv("MYSQL_PASSWORD", "change-me"),
        "HOST": os.getenv("MYSQL_HOST", "127.0.0.1"),
        "PORT": os.getenv("MYSQL_PORT", "3306"),
        "OPTIONS": {"charset": "utf8mb4"},
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "core.pagination.DefaultPageNumberPagination",
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_RENDERER_CLASSES": (
        "core.renderers.APIRenderer",
    ),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.ScopedRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "api_read": os.getenv("API_THROTTLE_RATE_API_READ", "120/min"),
        "api_write": os.getenv("API_THROTTLE_RATE_API_WRITE", "30/min"),
        "auth": os.getenv("API_THROTTLE_RATE_AUTH", "10/min"),
        "tool_query": os.getenv("API_THROTTLE_RATE_TOOL_QUERY", "60/min"),
        "handoff": os.getenv("API_THROTTLE_RATE_HANDOFF", "60/min"),
        "audit_read": os.getenv("API_THROTTLE_RATE_AUDIT_READ", "30/min"),
        "user_admin": os.getenv("API_THROTTLE_RATE_USER_ADMIN", "20/min"),
        "approval_write": os.getenv("API_THROTTLE_RATE_APPROVAL_WRITE", "20/min"),
        "execution_write": os.getenv("API_THROTTLE_RATE_EXECUTION_WRITE", "30/min"),
        "agent_ingest": os.getenv("API_THROTTLE_RATE_AGENT_INGEST", "120/min"),
    },
    "EXCEPTION_HANDLER": "core.exceptions.api_exception_handler",
    "PAGE_SIZE": 20,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.getenv("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", "30"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("JWT_REFRESH_TOKEN_LIFETIME_DAYS", "7"))),
    "ALGORITHM": os.getenv("JWT_ALGORITHM", "HS256"),
    "SIGNING_KEY": JWT_SIGNING_KEY,
}

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0"),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
    }
}

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",")
    if origin.strip()
]

AGENT_INGEST_ENABLED = os.getenv("AGENT_INGEST_ENABLED", "False").lower() == "true"
AGENT_INGEST_HMAC_KEY_ID = os.getenv("AGENT_INGEST_HMAC_KEY_ID", "agent-default")
AGENT_INGEST_HMAC_SECRET = os.getenv("AGENT_INGEST_HMAC_SECRET", "")
AGENT_INGEST_TIMESTAMP_TOLERANCE_SECONDS = int(os.getenv("AGENT_INGEST_TIMESTAMP_TOLERANCE_SECONDS", "300"))
AGENT_INGEST_REPLAY_CACHE_PREFIX = os.getenv("AGENT_INGEST_REPLAY_CACHE_PREFIX", "agent_ingest:replay")

SPECTACULAR_SETTINGS = {
    "TITLE": "ChatOps CMDB Backend API",
    "DESCRIPTION": "Phase 1 backend API for auth, CMDB, audit, automation, and agent signed ingest.",
    "VERSION": "0.2.0",
}
