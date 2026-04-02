from rest_framework.response import Response


def build_normalized_tool_response(request, query, items, *, status=None):
    limit = query["limit"]
    truncated = len(items) > limit
    visible_items = items[:limit]
    response_data = {
        "ok": True,
        "request_id": getattr(request, "request_id", ""),
        "query": query,
        "summary": {
            "count": len(visible_items),
            "returned": len(visible_items),
            "truncated": truncated,
        },
        "items": visible_items,
    }
    return Response(response_data, status=status)
