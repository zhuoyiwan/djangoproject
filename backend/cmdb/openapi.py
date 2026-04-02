from drf_spectacular.extensions import OpenApiAuthenticationExtension


class AgentHMACAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "cmdb.authentication.AgentHMACAuthentication"
    name = "agentHmacAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "header",
            "name": "X-Agent-Signature",
            "description": "Agent ingest HMAC authentication. Required headers: X-Agent-Key-Id, X-Agent-Timestamp, X-Agent-Signature.",
        }
