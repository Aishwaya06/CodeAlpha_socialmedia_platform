# Connectly

Connectly is a small social platform with a Django REST Framework backend and a responsive HTML/CSS/vanilla JavaScript frontend. The root entry point also supports a browser-only demonstration on static hosts such as GitHub Pages.

## Project status

The Django application and APIs are implemented for local use. The root `index.html` runs a separate frontend-only demo backed by versioned browser storage; it does not call Django. The static demo is not real authentication and its data is not shared between browsers.

Latest verification: `python manage.py check` passed, migration checks reported no pending model changes, and `python manage.py test` passed all 39 tests. Static frontend interactions were checked in a local browser; the deployed GitHub Pages site has not been independently verified.

## Project structure

```text
connectly/                 Django project settings, URL configuration, ASGI/WSGI
social/                    Models, serializers, API views, permissions, migrations, tests
  migrations/              Database schema migrations
  test_*.py                Feature API tests
frontend/
  templates/index.html     Single-page application shell
  static/css/app.css       Responsive application styles
  static/js/api.js         Compatibility re-export for the local demonstration data service
  static/js/demo-data.js   Versioned localStorage-backed sample posts, profiles, and interactions
  static/js/app.js         Vanilla JavaScript routes and UI interactions
  static/images/           Bundled default avatar
index.html                 Root entry point for static hosts such as GitHub Pages
manage.py                  Django management entry point
requirements.txt           Pinned Python runtime dependencies
db.sqlite3                 Local SQLite database (ignored by Git)
media/                     Uploaded profile pictures (ignored by Git)
```

## Technology

- Python (validated here with Python 3.12)
- Django 5.2.18 and Django REST Framework 3.18.3
- SQLite
- Pillow 10.4.0 for profile image handling
- HTML5, CSS3, vanilla JavaScript, and browser localStorage for the static demo

Python dependency versions are pinned in `requirements.txt`. No frontend package manager or third-party JavaScript dependency is required.

## Implemented features

- Account registration, login, logout, and current-session lookup.
- Public profiles, profile editing, optional profile-picture upload, and post/follower/following counts.
- Newest-first paginated feed, post creation, owner-only editing and deletion, and per-user post lists.
- Paginated comments, authenticated comment creation, and comment-author-only deletion.
- Idempotent like and unlike operations with current-user like state and counts.
- Idempotent follow and unfollow operations, follower/following lists, and self-follow prevention.
- Paginated user discovery with case-insensitive username search.
- Responsive layouts, loading/error/empty states, accessible forms, and a bundled default avatar.

The Django-backed application uses the API for server state. The root static-host demo instead uses sample accounts and browser `localStorage`; it does not call the Django API.

## GitHub Pages demonstration

The root `index.html` and `frontend/static/js/app.js` load the existing Connectly interface without Django template rendering. Its demonstration content, likes, comments, follows, profile edits, and demo-mode choice are stored under the versioned `connectly.demo.v1` browser storage key. Use **Reset** in the header to restore the original sample data. If browser storage is blocked or full, the demo remains usable in memory for that tab and displays a warning.

The demo starts as **@maya**, a clearly identified demonstration account. **Exit demo** returns to read-only browsing; the sign-in and registration routes explain that no Django backend is deployed. Demo state is not secure authentication, is not shared with other visitors, and must not be used for passwords or sensitive information. Post image attachments are not provided by the current composer; profile pictures can be stored locally when the selected image is under 300 KB.

## Database design

The `social` app uses Django ORM models and the configured `AUTH_USER_MODEL`:

| Model | Relationships and behavior |
|---|---|
| `Profile` | One-to-one with a user; bio, optional image, location, timestamps. Created automatically for new users. |
| `Post` | Belongs to an author; content limited to 5,000 characters; timestamps. Deleting a user cascades to their posts. |
| `Comment` | Belongs to a post and author; content limited to 2,000 characters; timestamps. Deleting its post or author cascades to the comment. |
| `Like` | Joins a user and post; unique constraint prevents duplicate user/post likes. Cascades when either related record is deleted. |
| `Follow` | Joins follower and followed user; unique pair and database check prevent duplicates and self-follows. |

Post and comment validators reject empty or whitespace-only content. Deleting a post cascades to its likes and comments. Migrations are in `social/migrations/`. Local SQLite data is not reset by `migrate`.

## API endpoints

All API routes are same-origin under `/api/`. List endpoints use page-number pagination and return `count`, `next`, `previous`, and `results`. Profile and post lists accept `page_size` (maximum 100); feed and comments use the same pagination behavior.

| Method and route | Purpose / access |
|---|---|
| `GET /api/auth/csrf/` | Start CSRF session and return `csrfToken`; public. |
| `POST /api/auth/register/` | Register with `username`, `email`, `password`, `password_confirmation`; CSRF required. |
| `POST /api/auth/login/` | Log in with `username` and `password`; establishes Django session; CSRF required. |
| `POST /api/auth/logout/` | End session; CSRF required. |
| `GET /api/auth/me/` | Current authenticated user; requires login. |
| `GET /api/posts/` | Paginated newest-first feed; public. |
| `POST /api/posts/` | Create post with `content`; requires login. Author comes from session. |
| `GET /api/posts/{id}/` | Retrieve a post; public. |
| `PATCH /api/posts/{id}/` | Edit post `content`; owner only. |
| `DELETE /api/posts/{id}/` | Delete post; owner only. Related comments/likes are deleted. |
| `GET /api/posts/{id}/comments/` | Paginated comments; public. |
| `POST /api/posts/{id}/comments/` | Create comment with `content`; requires login. |
| `DELETE /api/comments/{id}/` | Delete comment; comment author only. Response includes updated `comment_count`. |
| `GET /api/posts/{id}/like/` | Return `like_count` and current viewer's `is_liked`; public. |
| `POST /api/posts/{id}/like/` | Like post idempotently; requires login. |
| `DELETE /api/posts/{id}/like/` | Remove current user's like; requires login. |
| `GET /api/profiles/` | Paginated public profiles; excludes current user when logged in. Optional `?search=username`. |
| `GET /api/profiles/me/` | Current user's profile; requires login. |
| `PATCH /api/profiles/me/` | Update `bio`, `location`, or `profile_picture`; requires login. Image limit is 5 MB. |
| `GET /api/profiles/{username}/` | Public profile and follower/following/post counts. |
| `GET /api/profiles/{username}/posts/` | Paginated posts by user; public. |
| `GET /api/profiles/{username}/followers/` | Paginated follower profiles; public. |
| `GET /api/profiles/{username}/following/` | Paginated followed profiles; public. |
| `POST /api/profiles/{username}/follow/` | Follow user idempotently; requires login; self-follow rejected. |
| `DELETE /api/profiles/{username}/follow/` | Unfollow current user's relationship; requires login. |

Post responses include author details, content, timestamps, like/comment counts, and `is_liked`. Public profile responses omit account email and credentials.

## Authentication and permissions

- Django REST Framework uses Django `SessionAuthentication`; the browser sends same-origin session cookies with Fetch API requests.
- The frontend calls `/api/auth/csrf/` and sends the returned token in `X-CSRFToken` for unsafe requests. CSRF protection remains enabled for registration, login, logout, and authenticated writes.
- The session cookie is HTTP-only and uses `SameSite=Lax`. In non-debug mode session and CSRF cookies are secure and HTTPS redirect is enabled.
- Reads are public where appropriate. Creating posts/comments, changing likes/follows, and editing one's profile require authentication.
- Post updates/deletes are owner-only; comment deletion is author-only. User identity and post/comment authors are assigned by the backend rather than trusted from request data.
- `DJANGO_SECRET_KEY` is required when `DJANGO_DEBUG=false`. The built-in development fallback key is only for local development and must not be used for deployment.

## Windows PowerShell: install and run

Run these commands from the project directory (`D:\Mini_socialmedia_platform` in the supplied workspace):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Open **http://127.0.0.1:8000/**. The Django admin is at **http://127.0.0.1:8000/admin/**.

To run the automated tests (in a second terminal, or stop the development server first):

```powershell
python manage.py test
```

`createsuperuser` prompts interactively for an administrator name and password; do not commit those credentials. `migrate` creates a database from migrations if one is absent and applies pending migrations to an existing database without resetting it.

## Troubleshooting

- **PowerShell blocks activation:** in the current terminal, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, then activate again. This affects only that PowerShell process.
- **`No module named django` or another dependency:** activate `.venv` and run `python -m pip install -r requirements.txt` again.
- **Missing database tables:** run `python manage.py migrate` from the project directory.
- **Port 8000 is busy:** use `python manage.py runserver 127.0.0.1:8001` and open `http://127.0.0.1:8001/`.
- **Host validation error:** use `localhost` or `127.0.0.1` for local access, or configure `DJANGO_ALLOWED_HOSTS` with the hostnames actually used.
- **CSRF failure:** use the same host and port for the page and API, refresh the page to obtain a current CSRF token, and avoid disabling CSRF checks.
- **Profile image upload fails:** ensure the image is valid and no larger than 5 MB for Django, or 300 KB for the browser-only demo. Local uploaded media is served by Django only in debug mode.

## Known limitations and deployment status

- The local browser-only demo was checked for feed, discover/search, profiles, posts, likes, comments, persistence, follow toggling, demo entry/exit, reset, asset loading, console errors, unavailable API requests, and mobile-width overflow. The live GitHub Pages deployment was not independently verified after these changes.
- SQLite is configured for local demonstration. No production database, deployment service, container setup, CI workflow, or production static/media hosting is configured.
- GitHub Pages can serve the root frontend shell and its static assets, but cannot run this Django application's API. The root static frontend therefore uses local demonstration data; production multi-user social features and real authentication still require a deployed backend and an integration configuration.
- No deployment has occurred or been verified. Production hosting would need an explicit secret, host/domain, HTTPS, durable database, static/media serving, and deployment-specific configuration.
- The local database (`db.sqlite3`) and uploaded files (`media/`) are intentionally excluded by `.gitignore`; they are local state and are not included in a source submission unless deliberately handled separately.
