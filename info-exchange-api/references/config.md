# .info.config

This file should live in the project directory that wants to use the information exchange platform.

Example:

```json
{
  "baseUrl": "http://127.0.0.1:3000",
  "defaults": {
    "projectId": "project_123",
    "pageSize": 20,
    "recordStatus": "in_progress"
  },
  "auth": {
    "roleKeyEnv": "INFO_ROLE_KEY",
    "adminKeyEnv": "INFO_ADMIN_KEY"
  },
  "ssl": {
    "certificatePath": "./certs/fullchain.pem",
    "privateKeyPath": "./certs/privkey.pem"
  },
  "timeouts": {
    "requestMs": 15000
  }
}
```

Resolution order:
1. explicit command args
2. env vars referenced by `roleKeyEnv` / `adminKeyEnv`
3. inline `roleKey` / `adminKey`

Lookup strategy:
- Search `.info.config` from the current directory upward.
