from rest_framework.renderers import JSONRenderer


class APIRenderer(JSONRenderer):
    charset = "utf-8"
