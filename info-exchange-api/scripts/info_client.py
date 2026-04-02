import argparse
import json
import os
import sys
from pathlib import Path
from urllib import error, parse, request

RECORD_STATUSES = {"todo", "in_progress", "done", "blocked"}


def find_config(start: Path) -> Path | None:
    current = start.resolve()
    if current.is_file():
        current = current.parent
    while True:
        candidate = current / '.info.config'
        if candidate.exists():
            return candidate
        if current.parent == current:
            return None
        current = current.parent


def load_config() -> tuple[dict, Path]:
    config_path = find_config(Path.cwd())
    if not config_path:
        fail('config_not_found', 'No .info.config found in current directory or parents')
    try:
        return json.loads(config_path.read_text(encoding='utf-8')), config_path
    except json.JSONDecodeError as exc:
        fail('invalid_config', f'Invalid .info.config JSON: {exc.msg}')


def fail(code: str, message: str, status: int = 1, operation: str | None = None):
    payload = {
        'ok': False,
        'operation': operation,
        'status': status,
        'error': {
            'code': code,
            'message': message,
        },
    }
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(1)


def success(operation: str, status: int, data):
    print(json.dumps({'ok': True, 'operation': operation, 'status': status, 'data': data}, ensure_ascii=False))


def resolve_value(explicit, config_auth: dict, inline_key_name: str, env_name_key: str):
    if explicit:
        return explicit
    env_name = config_auth.get(env_name_key)
    if env_name:
        env_value = os.getenv(env_name)
        if env_value:
            return env_value
    return config_auth.get(inline_key_name)


def build_url(base_url: str, path: str, query: dict | None = None) -> str:
    url = base_url.rstrip('/') + path
    if query:
        clean = {k: v for k, v in query.items() if v is not None}
        if clean:
            url += '?' + parse.urlencode(clean)
    return url


def http_request(method: str, url: str, headers=None, body=None, timeout_ms: int = 15000):
    req = request.Request(url, method=method, headers=headers or {}, data=body)
    try:
        with request.urlopen(req, timeout=timeout_ms / 1000) as resp:
            raw = resp.read().decode('utf-8')
            return resp.status, json.loads(raw) if raw else None
    except error.HTTPError as exc:
        raw = exc.read().decode('utf-8')
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {'error': raw}
        return exc.code, body
    except error.URLError as exc:
        fail('network_error', str(exc.reason))


def normalize_error(operation: str, status: int, body: dict):
    message = body.get('error', 'Request failed') if isinstance(body, dict) else 'Request failed'
    payload = {
        'ok': False,
        'operation': operation,
        'status': status,
        'error': {
            'code': str(message).strip().lower().replace(' ', '_'),
            'message': message,
        },
    }
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(1)


def require_project_id(args, config):
    project_id = args.project_id or config.get('defaults', {}).get('projectId')
    if not project_id:
        fail('missing_project_id', 'Project ID is required for this operation')
    return project_id


def require_base_url(config):
    base_url = config.get('baseUrl')
    if not base_url:
        fail('missing_base_url', 'baseUrl is required in .info.config')
    return base_url


def op_create_role(args, config):
    base_url = require_base_url(config)
    status, body = http_request(
        'POST',
        build_url(base_url, '/api/roles'),
        headers={'content-type': 'application/json'},
        body=json.dumps({'name': args.name, 'description': args.description}).encode('utf-8'),
        timeout_ms=config.get('timeouts', {}).get('requestMs', 15000),
    )
    if status >= 400:
        normalize_error('create-role', status, body)
    success('create-role', status, body)


def op_create_project(args, config):
    base_url = require_base_url(config)
    role_key = resolve_value(args.role_key, config.get('auth', {}), 'roleKey', 'roleKeyEnv')
    if not role_key:
        fail('missing_role_key', 'Role key is required for project creation')
    status, body = http_request(
        'POST',
        build_url(base_url, '/api/projects'),
        headers={'content-type': 'application/json', 'x-role-key': role_key},
        body=json.dumps({
            'name': args.name,
            'description': args.description,
            'goal': args.goal,
            'notes': args.notes,
            'repoUrl': args.repo_url,
            'defaultBranch': args.default_branch,
        }).encode('utf-8'),
        timeout_ms=config.get('timeouts', {}).get('requestMs', 15000),
    )
    if status >= 400:
        normalize_error('create-project', status, body)
    normalized = dict(body)
    if 'project_key' in normalized:
        normalized['projectKey'] = normalized['project_key']
    success('create-project', status, normalized)


def op_join_project(args, config):
    base_url = require_base_url(config)
    role_key = resolve_value(args.role_key, config.get('auth', {}), 'roleKey', 'roleKeyEnv')
    if not role_key:
        fail('missing_role_key', 'Role key is required for joining a project')
    status, body = http_request(
        'POST',
        build_url(base_url, '/api/projects/join'),
        headers={'content-type': 'application/json', 'x-role-key': role_key},
        body=json.dumps({'projectKey': args.project_key}).encode('utf-8'),
        timeout_ms=config.get('timeouts', {}).get('requestMs', 15000),
    )
    if status >= 400:
        normalize_error('join-project', status, body)
    success('join-project', status, body)


def op_get_project(args, config):
    base_url = require_base_url(config)
    role_key = resolve_value(args.role_key, config.get('auth', {}), 'roleKey', 'roleKeyEnv')
    if not role_key:
        fail('missing_role_key', 'Role key is required for project detail')
    project_id = require_project_id(args, config)
    status, body = http_request(
        'GET',
        build_url(base_url, f'/api/projects/{project_id}'),
        headers={'x-role-key': role_key},
        timeout_ms=config.get('timeouts', {}).get('requestMs', 15000),
    )
    if status >= 400:
        normalize_error('get-project', status, body)
    success('get-project', status, body)


def op_list_records(args, config):
    base_url = require_base_url(config)
    role_key = resolve_value(args.role_key, config.get('auth', {}), 'roleKey', 'roleKeyEnv')
    if not role_key:
        fail('missing_role_key', 'Role key is required for listing records')
    project_id = require_project_id(args, config)
    status_value = args.status or config.get('defaults', {}).get('recordStatus')
    if status_value and status_value not in RECORD_STATUSES:
        fail('invalid_record_status', 'Record status must be one of todo, in_progress, done, blocked')
    page_size = args.page_size or config.get('defaults', {}).get('pageSize')
    status, body = http_request(
        'GET',
        build_url(base_url, f'/api/projects/{project_id}/records', {'page': args.page, 'pageSize': page_size, 'status': status_value, 'roleId': args.role_id}),
        headers={'x-role-key': role_key},
        timeout_ms=config.get('timeouts', {}).get('requestMs', 15000),
    )
    if status >= 400:
        normalize_error('list-records', status, body)
    success('list-records', status, body)


def op_create_record(args, config):
    base_url = require_base_url(config)
    role_key = resolve_value(args.role_key, config.get('auth', {}), 'roleKey', 'roleKeyEnv')
    if not role_key:
        fail('missing_role_key', 'Role key is required for creating records')
    project_id = require_project_id(args, config)
    if args.status not in RECORD_STATUSES:
        fail('invalid_record_status', 'Record status must be one of todo, in_progress, done, blocked')
    status, body = http_request(
        'POST',
        build_url(base_url, f'/api/projects/{project_id}/records'),
        headers={'content-type': 'application/json', 'x-role-key': role_key},
        body=json.dumps({
            'occurredAt': args.occurred_at,
            'title': args.title,
            'content': args.content,
            'result': args.result,
            'nextStep': args.next_step,
            'risk': args.risk,
            'status': args.status,
            'branchName': args.branch_name,
            'commitHash': args.commit_hash,
            'prUrl': args.pr_url,
            'changedFiles': args.changed_files,
            'diffSummary': args.diff_summary,
        }).encode('utf-8'),
        timeout_ms=config.get('timeouts', {}).get('requestMs', 15000),
    )
    if status >= 400:
        normalize_error('create-record', status, body)
    success('create-record', status, body)


def op_admin_list_roles(args, config):
    base_url = require_base_url(config)
    admin_key = resolve_value(args.admin_key, config.get('auth', {}), 'adminKey', 'adminKeyEnv')
    if not admin_key:
        fail('missing_admin_key', 'Admin key is required for listing roles')
    status, body = http_request('GET', build_url(base_url, '/api/admin/roles'), headers={'x-admin-key': admin_key}, timeout_ms=config.get('timeouts', {}).get('requestMs', 15000))
    if status >= 400:
        normalize_error('admin-list-roles', status, body)
    success('admin-list-roles', status, body)


def op_admin_list_projects(args, config):
    base_url = require_base_url(config)
    admin_key = resolve_value(args.admin_key, config.get('auth', {}), 'adminKey', 'adminKeyEnv')
    if not admin_key:
        fail('missing_admin_key', 'Admin key is required for listing projects')
    status, body = http_request('GET', build_url(base_url, '/api/admin/projects'), headers={'x-admin-key': admin_key}, timeout_ms=config.get('timeouts', {}).get('requestMs', 15000))
    if status >= 400:
        normalize_error('admin-list-projects', status, body)
    success('admin-list-projects', status, body)


def op_admin_disable_role(args, config):
    base_url = require_base_url(config)
    admin_key = resolve_value(args.admin_key, config.get('auth', {}), 'adminKey', 'adminKeyEnv')
    if not admin_key:
        fail('missing_admin_key', 'Admin key is required for disabling roles')
    status, body = http_request('POST', build_url(base_url, f'/api/admin/roles/{args.role_id}/disable'), headers={'x-admin-key': admin_key}, timeout_ms=config.get('timeouts', {}).get('requestMs', 15000))
    if status >= 400:
        normalize_error('admin-disable-role', status, body)
    success('admin-disable-role', status, body)


def op_admin_disable_project(args, config):
    base_url = require_base_url(config)
    admin_key = resolve_value(args.admin_key, config.get('auth', {}), 'adminKey', 'adminKeyEnv')
    if not admin_key:
        fail('missing_admin_key', 'Admin key is required for disabling projects')
    status, body = http_request('POST', build_url(base_url, f'/api/admin/projects/{args.project_id}/disable'), headers={'x-admin-key': admin_key}, timeout_ms=config.get('timeouts', {}).get('requestMs', 15000))
    if status >= 400:
        normalize_error('admin-disable-project', status, body)
    success('admin-disable-project', status, body)


def encode_multipart(fields, files):
    boundary = '----InfoExchangeBoundary'
    body = bytearray()
    for name, value in fields.items():
        body.extend(f'--{boundary}\r\n'.encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(str(value).encode())
        body.extend(b'\r\n')
    for name, path in files.items():
        file_path = Path(path)
        if not file_path.exists():
            fail('missing_file', f'{path} does not exist')
        body.extend(f'--{boundary}\r\n'.encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"; filename="{file_path.name}"\r\n'.encode())
        body.extend(b'Content-Type: application/octet-stream\r\n\r\n')
        body.extend(file_path.read_bytes())
        body.extend(b'\r\n')
    body.extend(f'--{boundary}--\r\n'.encode())
    return boundary, bytes(body)


def op_admin_upload_ssl(args, config):
    base_url = require_base_url(config)
    admin_key = resolve_value(args.admin_key, config.get('auth', {}), 'adminKey', 'adminKeyEnv')
    if not admin_key:
        fail('missing_admin_key', 'Admin key is required for SSL upload')
    certificate_path = args.certificate_path or config.get('ssl', {}).get('certificatePath')
    private_key_path = args.private_key_path or config.get('ssl', {}).get('privateKeyPath')
    if not certificate_path or not private_key_path:
        fail('missing_ssl_paths', 'Certificate and private key paths are required')
    boundary, body = encode_multipart({}, {'certificate': certificate_path, 'privateKey': private_key_path})
    status, response_body = http_request(
        'POST',
        build_url(base_url, '/api/admin/config/ssl'),
        headers={'x-admin-key': admin_key, 'content-type': f'multipart/form-data; boundary={boundary}'},
        body=body,
        timeout_ms=config.get('timeouts', {}).get('requestMs', 15000),
    )
    if status >= 400:
        normalize_error('admin-upload-ssl', status, response_body)
    success('admin-upload-ssl', status, response_body)


def build_parser():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='operation', required=True)

    p = sub.add_parser('create-role')
    p.add_argument('--name', required=True)
    p.add_argument('--description', default='')
    p.set_defaults(func=op_create_role)

    p = sub.add_parser('create-project')
    p.add_argument('--name', required=True)
    p.add_argument('--description', default='')
    p.add_argument('--goal', default='')
    p.add_argument('--notes', default='')
    p.add_argument('--role-key')
    p.add_argument('--repo-url')
    p.add_argument('--default-branch')
    p.set_defaults(func=op_create_project)

    p = sub.add_parser('join-project')
    p.add_argument('--project-key', required=True)
    p.add_argument('--role-key')
    p.set_defaults(func=op_join_project)

    p = sub.add_parser('get-project')
    p.add_argument('--project-id')
    p.add_argument('--role-key')
    p.set_defaults(func=op_get_project)

    p = sub.add_parser('list-records')
    p.add_argument('--project-id')
    p.add_argument('--role-key')
    p.add_argument('--page', type=int)
    p.add_argument('--page-size', type=int)
    p.add_argument('--status')
    p.add_argument('--role-id')
    p.set_defaults(func=op_list_records)

    p = sub.add_parser('create-record')
    p.add_argument('--project-id')
    p.add_argument('--role-key')
    p.add_argument('--occurred-at', required=True)
    p.add_argument('--title', required=True)
    p.add_argument('--content', required=True)
    p.add_argument('--result', required=True)
    p.add_argument('--next-step', required=True)
    p.add_argument('--risk', required=True)
    p.add_argument('--status', required=True)
    p.add_argument('--branch-name')
    p.add_argument('--commit-hash')
    p.add_argument('--pr-url')
    p.add_argument('--changed-files')
    p.add_argument('--diff-summary')
    p.set_defaults(func=op_create_record)

    p = sub.add_parser('admin-list-roles')
    p.add_argument('--admin-key')
    p.set_defaults(func=op_admin_list_roles)

    p = sub.add_parser('admin-list-projects')
    p.add_argument('--admin-key')
    p.set_defaults(func=op_admin_list_projects)

    p = sub.add_parser('admin-disable-role')
    p.add_argument('--role-id', required=True)
    p.add_argument('--admin-key')
    p.set_defaults(func=op_admin_disable_role)

    p = sub.add_parser('admin-disable-project')
    p.add_argument('--project-id', required=True)
    p.add_argument('--admin-key')
    p.set_defaults(func=op_admin_disable_project)

    p = sub.add_parser('admin-upload-ssl')
    p.add_argument('--certificate-path')
    p.add_argument('--private-key-path')
    p.add_argument('--admin-key')
    p.set_defaults(func=op_admin_upload_ssl)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    config, _ = load_config()
    args.func(args, config)


if __name__ == '__main__':
    main()
