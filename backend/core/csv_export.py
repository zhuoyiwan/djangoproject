import csv
from datetime import datetime
from typing import Iterable
from urllib.parse import quote

from django.http import HttpResponse


def build_export_filename(feature_name: str):
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"{feature_name}_{timestamp}.csv"


def build_csv_export_response(feature_name: str, headers: list[str], rows: Iterable[Iterable[object]]):
    filename = build_export_filename(feature_name)
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = (
        f'attachment; filename="export.csv"; filename*=UTF-8\'\'{quote(filename)}'
    )
    response.write("\ufeff")

    writer = csv.writer(response)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(["" if value is None else value for value in row])

    return response
