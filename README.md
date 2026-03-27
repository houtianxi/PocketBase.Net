# PocketbaseNet

A .NET + React full-stack clone of core PocketBase features.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | .NET 10, ASP.NET Core Web API, EF Core 10 |
| Auth | ASP.NET Core Identity + JWT Bearer |
| Database | SQLite (dev) / SQL Server (prod) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| UI | shadcn-style components + Ant Design |
| AI Chat | @ant-design/x (Bubble.List + Sender) |

---

## Quick Start

### 1. Backend

```bash
cd backend
dotnet run --launch-profile http
```

- Swagger UI: http://localhost:5253/swagger
- Health check: http://localhost:5253/api/health

**Default admin credentials:**
- Email: `admin@pocketbase.net`
- Password: `Admin1234`

### 2. Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

- App: http://localhost:5173 (or next available port)

---

## Configuration

### Switch to SQL Server (production)

Edit `backend/appsettings.json`:

```json
{
  "DatabaseProvider": "SqlServer",
  "ConnectionStrings": {
    "DefaultConnection": "Server=YOUR_SERVER;Database=PocketbaseNet;Trusted_Connection=True;"
  }
}
```

Then run migrations:

```bash
cd backend
dotnet ef database update
```

### Frontend API URL

Edit `frontend/.env`:

```
VITE_API_BASE_URL=/api
VITE_BACKEND_ORIGIN=http://localhost:5253
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login, returns JWT |
| GET  | `/api/auth/me` | Get current user (requires auth) |

### Collections (Admin only)
| Method | Endpoint | Description |
|---|---|---|
| GET    | `/api/collections` | List all collections |
| POST   | `/api/collections` | Create collection |
| PUT    | `/api/collections/{id}` | Update collection |
| DELETE | `/api/collections/{id}` | Delete collection |

### Records (Rule-evaluated)
| Method | Endpoint | Description |
|---|---|---|
| GET    | `/api/records/{slug}` | List records |
| POST   | `/api/records/{slug}` | Create record |
| GET    | `/api/records/{slug}/{id}` | Get record |
| PUT    | `/api/records/{slug}/{id}` | Update record |
| DELETE | `/api/records/{slug}/{id}` | Delete record |

### Users (Admin only)
| Method | Endpoint | Description |
|---|---|---|
| GET    | `/api/users` | List all users |
| POST   | `/api/users` | Create user |
| PUT    | `/api/users/{id}` | Update user |
| DELETE | `/api/users/{id}` | Delete user |

### AI Chat
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ai/chat` | Send message to AI |
| GET  | `/api/ai/conversations` | List conversations |
| GET  | `/api/ai/conversations/{id}/messages` | Get messages |

---

## Access Control

Collections support PocketBase-style rule levels:

| Level | Value | Description |
|---|---|---|
| `Public` | 0 | Anyone can access |
| `Authenticated` | 1 | Must be logged in |
| `Owner` | 2 | Only the record creator |
| `Admin` | 3 | Admin role only |

Configure per-operation (list, view, create, update, delete) when creating a collection.

---

## Project Structure

```
Pocketbase.net/
├── backend/
│   ├── Controllers/       # API endpoints
│   ├── Domain/
│   │   ├── Entities/      # EF Core entity models
│   │   └── Enums/         # RuleAccessLevel etc.
│   ├── Infrastructure/
│   │   ├── AppDbContext.cs
│   │   ├── Auth/          # JWT + CurrentUser services
│   │   └── Services/      # RuleEvaluator
│   ├── Contracts/         # Request/response DTOs
│   ├── Program.cs
│   └── appsettings.json
└── frontend/
    ├── src/
    │   ├── App.tsx        # Main management console
    │   ├── lib/
    │   │   ├── api.ts     # Axios client
    │   │   └── utils.ts   # cn() utility
    │   └── components/ui/ # shadcn-style components
    ├── .env
    └── vite.config.ts
```
