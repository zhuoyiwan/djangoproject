from rest_framework.response import Response

from .serializers import JobHandoffItemSerializer


def build_job_handoff_response(request, jobs, query):
    items = JobHandoffItemSerializer(jobs, many=True).data
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
    return Response(response_data)
