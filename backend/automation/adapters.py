from core.tool_responses import build_normalized_tool_response

from .serializers import JobHandoffItemSerializer


def build_job_handoff_response(request, jobs, query):
    items = JobHandoffItemSerializer(jobs, many=True).data
    return build_normalized_tool_response(request, query, items)
