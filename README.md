# Django Bootstrap

This repository is bootstrapped for a Django application with MySQL, Redis, and JWT-based authentication.

## Local setup notes

- Copy `/Users/zhuoyiwan/Code/django/.env.example` to `.env` and fill in local values.
- Keep `/Users/zhuoyiwan/Code/django/.info.config` on your machine only. It is intentionally ignored by git and must not be copied into docs, commits, or shared channels.
- The Django backend scaffold now lives under `/Users/zhuoyiwan/Code/django/backend`.

## Expected services

- Python / Django runtime
- MySQL database
- Redis cache / broker

## Environment configuration

See `/Users/zhuoyiwan/Code/django/.env.example` for shared bootstrap variables and `/Users/zhuoyiwan/Code/django/backend/.env.example` for backend-specific runtime settings.
