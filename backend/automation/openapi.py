from drf_spectacular.extensions import OpenApiAuthenticationExtension


class AutomationAgentClaimHMACAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "automation.authentication.AutomationAgentClaimHMACAuthentication"
    name = "automationAgentClaimHmacAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "header",
            "name": "X-Agent-Signature",
            "description": "Automation agent claim HMAC authentication. Required headers: X-Agent-Key-Id, X-Agent-Timestamp, X-Agent-Signature.",
        }


class AutomationAgentHMACAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "automation.authentication.AutomationAgentHMACAuthentication"
    name = "automationAgentHmacAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "header",
            "name": "X-Agent-Signature",
            "description": "Automation agent report HMAC authentication. Required headers: X-Agent-Key-Id, X-Agent-Timestamp, X-Agent-Signature.",
        }
