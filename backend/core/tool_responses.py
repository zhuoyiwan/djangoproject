from rest_framework.response import Response


def build_normalized_tool_response(request, query, items, *, status=None):
    response_data = {
        "ok": True,
        "request_id": getattr(request, "request_id", ""),
        "query": query,
        "summary": {
            "count": len(items),
            "returned": len(items),
            "truncated": len(items) == query["limit"],
        },
        "items": items,
    }
    return Response(response_data, status=status)
