# Running the AI Wallet backend

This is a Django REST backend for the mock banking system. It uses PostgreSQL.

## Local setup

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install django-filter
```

`django-filter` is required by `config/settings.py` but is currently absent from
`requirements.txt`. Create a PostgreSQL database and configure `.env` with
`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, and `SECRET_KEY`.
For `/api/v1/chat/process/`, also set `OPENAI_API_KEY`; `OPENAI_BASE_URL` and
`OPENAI_MODEL` are optional.

```powershell
py manage.py migrate
py manage.py runserver 127.0.0.1:8000
```

The API base URL is `http://127.0.0.1:8000/api/v1/`. Signup and token endpoints
are public; all banking and chat endpoints require
`Authorization: Bearer <access-token>`.

Create an account with `POST /users/signup/` using `password2` to confirm the
password. Obtain JWTs with `POST /users/token/` using `username` and `password`
(the bundled Postman examples use older field/path names in places).

Optional commands:

```powershell
py manage.py check
py manage.py createsuperuser
```

Admin: `http://127.0.0.1:8000/admin/`.

The complete endpoint list and response descriptions are in
[docs/openapi.yaml](docs/openapi.yaml).
