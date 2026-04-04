from audit.models import AuditLog
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def _build_error_response(code: str, message: str, request_id: str, details=None, http_status=status.HTTP_400_BAD_REQUEST):
    payload = {
        "ok": False,
        "error": {
            "code": code,
            "message": message,
        },
        "request_id": request_id,
    }
    if details is not None:
        payload["error"]["details"] = details
    return Response(payload, status=http_status)


def _audit_security_event(request, response):
    if request is None or getattr(request, "_security_event_audited", False):
        return
    if response.status_code not in {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}:
        return

    user = getattr(request, "user", None)
    actor = user if getattr(user, "is_authenticated", False) else None
    action = "security.auth.failed" if response.status_code == status.HTTP_401_UNAUTHORIZED else "security.permission.denied"
    target = f"{getattr(request, 'method', '')} {getattr(request, 'path', '')}".strip()
    detail = {
        "request_id": getattr(request, "request_id", ""),
        "status_code": response.status_code,
    }
    if response.status_code == status.HTTP_403_FORBIDDEN and actor is not None:
        detail["username"] = actor.get_username()

    AuditLog.objects.create(
        actor=actor,
        action=action,
        target=target,
        detail=detail,
    )
    request._security_event_audited = True


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    request = context.get("request")
    request_id = getattr(request, "request_id", "") if request else ""

    if response is None:
        return _build_error_response(
            code="internal_error",
            message="Internal server error.",
            request_id=request_id,
            http_status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    _audit_security_event(request, response)

    if response.status_code == status.HTTP_400_BAD_REQUEST:
        return _build_error_response(
            code="validation_error",
            message="Request validation failed.",
            request_id=request_id,
            details=response.data,
            http_status=response.status_code,
        )

    if response.status_code == status.HTTP_401_UNAUTHORIZED:
        return _build_error_response(
            code="unauthorized",
            message="Authentication credentials were not provided or are invalid.",
            request_id=request_id,
            details=response.data,
            http_status=response.status_code,
        )

    if response.status_code == status.HTTP_403_FORBIDDEN:
        return _build_error_response(
            code="forbidden",
            message="You do not have permission to perform this action.",
            request_id=request_id,
            details=response.data,
            http_status=response.status_code,
        )

    if response.status_code == status.HTTP_404_NOT_FOUND:
        return _build_error_response(
            code="not_found",
            message="Requested resource was not found.",
            request_id=request_id,
            details=response.data,
            http_status=response.status_code,
        )

    if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        return _build_error_response(
            code="rate_limited",
            message="Too many requests.",
            request_id=request_id,
            details=response.data,
            http_status=response.status_code,
        )

    return _build_error_response(
        code="request_error",
        message="Request failed.",
        request_id=request_id,
        details=response.data,
        http_status=response.status_code,
    )


