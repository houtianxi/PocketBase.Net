# PocketbaseNet

A .NET + React full-stack clone of core PocketBase features with support for dynamic collections, rich content editing, and file management.

## Features

✅ **Dynamic Collections** - Create and manage database tables on the fly  
✅ **Rich Text Editing** - Quill editor with image/video upload support  
✅ **File Management** - Upload, preview, and download attachments  
✅ **Access Control** - Rule-based permissions (Public, Authenticated, Owner, Admin)  
✅ **User Management** - Role-based user administration  
✅ **AI Chat Integration** - Conversational AI with history  
✅ **Real-time Metadata** - Batch file metadata queries for optimal performance  
✅ **Field Types** - Text, Email, URL, Number, Date, DateTime, Select, Relation, User, File, Avatar, Textarea, JSON, etc.

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | .NET 10, ASP.NET Core Web API, EF Core 10 |
| **Auth** | ASP.NET Core Identity + JWT Bearer |
| **Database** | SQL Server (LocalDB for dev) |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 |
| **UI** | shadcn-style components + Ant Design components |
| **Rich Text** | Quill Editor with custom image/video handlers |
| **File Upload** | Multipart FormData with metadata tracking |
| **AI Chat** | @ant-design/x bubble interface |

---

## Quick Start

### 1. Backend

```bash
cd backend
dotnet run --launch-profile https
```

- Swagger UI: https://localhost:7161/swagger
- API: https://localhost:7161/api

**Default admin credentials:**
- Email: `admin@pocketbase.net`
- Password: `Admin1234`

### 2. Frontend

```bash
cd frontend
pnpm install  # or npm install
pnpm dev      # or npm run dev
```

- App: http://localhost:5173

---

## Configuration

### Database Setup

The backend uses SQL Server (LocalDB). EF Core migrations are applied automatically on startup.

To reset the database:
```bash
cd backend
dotnet ef database drop -f
dotnet ef database update
```

### Frontend API URL

Edit or create `frontend/.env`:

```env
VITE_API_BASE_URL=/api
VITE_BACKEND_ORIGIN=http://localhost:7161
```

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login, returns JWT token |
| GET  | `/api/auth/me` | Get current user profile (auth required) |

### Collections (Admin only)
| Method | Endpoint | Description |
|---|---|---|
| GET    | `/api/collections` | List all collections |
| POST   | `/api/collections` | Create collection with fields |
| PUT    | `/api/collections/{id}` | Update collection |
| DELETE | `/api/collections/{id}` | Delete collection |
| GET    | `/api/collections/{id}/fields` | Get collection fields |
| POST   | `/api/collections/{id}/fields` | Add field to collection |

### Records (Rule-evaluated)
| Method | Endpoint | Description |
|---|---|---|
| GET    | `/api/records/{slug}?page=1&perPage=20` | List records with pagination |
| POST   | `/api/records/{slug}` | Create record (auth + create rule) |
| GET    | `/api/records/{slug}/{id}` | Get single record (view rule) |
| PUT    | `/api/records/{slug}/{id}` | Update record (update rule) |
| DELETE | `/api/records/{slug}/{id}` | Delete record (delete rule) |

### File Management
| Method | Endpoint | Description |
|---|---|---|
| POST   | `/api/files/upload` | Upload file (multipart/form-data) |
| GET    | `/api/files/stream/{type}/{fileName}` | Download/preview file (anonymous) |
| DELETE | `/api/files/{type}/{fileName}` | Delete file |
| GET    | `/api/files/metadata?fileNames=...&type=avatars` | Batch query file metadata |

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
| POST | `/api/ai/chat` | Send message to AI (streams response) |
| GET  | `/api/ai/conversations` | List user's conversations |

---

## Access Control

Collections support rule-based access control per operation:

| Level | Value | Description |
|---|---|---|
| **Public** | 0 | Anyone can access (no auth required) |
| **Authenticated** | 1 | Must be logged in |
| **Owner** | 2 | Only the record creator can access |
| **Admin** | 3 | Admin role only |

Rules are evaluated for: List, View, Create, Update, Delete operations.

---

## File Upload & Management

### Supported File Types
- **Avatars**: JPG, PNG, GIF (Max 100MB)
- **Attachments**: Any file type (Max 100MB)
- **Editor Images**: JPG, PNG, GIF, WebP (uploaded via Quill)
- **Editor Videos**: MP4, WebM, OGG (uploaded via Quill)

### File Storage
- Files are stored in `backend/uploads/` directory
- Metadata is tracked in the `FileAttachments` database table
- Original filenames are preserved and displayed in the UI
- Preview URLs are anonymous (no auth required)

### File Metadata Batch Query
For performance optimization, metadata for multiple files can be queried in a single API call:

```typescript
const metadata = await getFileMetadataBatch(
  ['file1.pdf', 'file2.jpg'],
  'attachments'
);
// Returns: [{ originalFileName, mimeType, fileSize, url, ... }, ...]
```

---

## Field Types

| Type | Description | Config |
|---|---|---|
| Text | Single-line text | - |
| Email | Email address | - |
| URL | Web link | - |
| Number | Integer or decimal | - |
| Checkbox | Boolean true/false | - |
| Date | Date picker (YYYY-MM-DD) | - |
| DateTime | Date + time picker | - |
| Select | Dropdown menu | `{ values: [...] }` |
| Textarea | Multi-line text | - |
| Quill (Textarea) | Rich text with image/video | - |
| JSON | Editable JSON object | - |
| Avatar | Single image upload | Max size in config |
| File | Multiple file upload | Max size in config |
| Relation | Link to another collection | `{ collectionId, relationType }` |
| User | Assign user to record | - |
| AutoIncrement | Auto-incrementing number | - |
| Formula | Computed field | - |
| Lookup | Aggregate from relations | - |

---

## Project Structure

```
Pocketbase.net/
├── backend/
│   ├── Controllers/            # API endpoints
│   │   ├── AuthController.cs
│   │   ├── CollectionsController.cs
│   │   ├── RecordsController.cs
│   │   ├── FilesController.cs
│   │   └── UsersController.cs
│   ├── Domain/
│   │   ├── Entities/           # EF Core models
│   │   │   ├── AppUser.cs
│   │   │   ├── CollectionDefinition.cs
│   │   │   ├── EntityRecord.cs
│   │   │   ├── FileAttachment.cs
│   │   │   └── ...
│   │   └── Enums/
│   │       └── RuleAccessLevel.cs
│   ├── Infrastructure/
│   │   ├── AppDbContext.cs     # EF Core context
│   │   ├── Auth/
│   │   │   ├── JwtTokenService.cs
│   │   │   ├── JwtOptions.cs
│   │   │   └── CurrentUserAccessor.cs
│   │   └── Services/
│   │       └── RuleEvaluator.cs
│   ├── Contracts/              # DTO classes
│   │   ├── AuthContracts.cs
│   │   ├── CollectionContracts.cs
│   │   ├── RecordContracts.cs
│   │   └── ...
│   ├── Program.cs
│   ├── appsettings.json
│   └── appsettings.Development.json
│
└── frontend/
    ├── src/
    │   ├── App.tsx             # Main management console
    │   ├── main.tsx
    │   ├── App.css
    │   ├── index.css           # Tailwind + globals
    │   ├── lib/
    │   │   ├── api.ts          # Axios client + types
    │   │   ├── fileUpload.ts   # File upload helpers
    │   │   ├── quillConfig.ts  # Quill editor setup
    │   │   └── utils.ts        # cn() utility
    │   ├── components/
    │   │   ├── RecordDialog.tsx        # Create/edit records
    │   │   ├── RecordsTable.tsx        # List records
    │   │   ├── CollectionDialog.tsx    # Manage collections
    │   │   ├── CollectionsView.tsx
    │   │   ├── UsersView.tsx
    │   │   ├── Sidebar.tsx
    │   │   └── ui/              # shadcn-style components
    │   │       ├── button.tsx
    │   │       ├── input.tsx
    │   │       ├── sheet.tsx
    │   │       ├── dialog.tsx
    │   │       └── ...
    │   └── assets/
    ├── public/
    ├── .env
    ├── .gitignore
    ├── vite.config.ts
    ├── tsconfig.json
    └── package.json
```

---

## Recent Features

### File Upload with Metadata Persistence
- Multipart file upload to `/api/files/upload`
- Automatic metadata storage in `FileAttachments` table
- Real-time display of original file names (not UUIDs)
- Batch metadata queries for performance

### Quill Rich Text Editor
- Image and video upload within editor
- Auto-insertion with preview URLs
- Corrected `this` binding in event handlers
- Support for formatting: bold, italic, lists, blockquotes, colors, etc.

### Dynamic File Preview
- Avatar images display inline with original names
- File attachments show original upload names in lists and edit forms
- Metadata is queried during component initialization
- Cached in React state to prevent redundant API calls

---

## Development Notes

### Authentication Flow
1. User logs in via `/api/auth/login` → receives JWT token
2. Token is stored in localStorage  
3. Token is automatically included in all API requests via Axios interceptor
4. File preview endpoint (`/api/files/stream`) is public (no token required)

### Rule Evaluation
- Rules are checked server-side on each record operation
- Rule levels: Public(0), Authenticated(1), Owner(2), Admin(3)
- Owner rules check if `record.ownerId === currentUserId`
- Rules prevent unauthorized access at the API level

### File Handling
- Files uploaded to `/uploads/{type}/` directory
- Stored with UUID filename to avoid conflicts
- Original filename preserved in database metadata
- Frontend displays `originalFileName` from metadata, not stored filename

---

## Troubleshooting

### Quill Editor Image Upload Fails
**Error**: `TypeError: this.getSelection is not a function`  
**Solution**: Handler functions must receive Quill instance as parameter. Use factory functions to bind `this` correctly.

### 401 on File Preview
**Error**: Images show broken with 401 Unauthorized  
**Solution**: Preview endpoint must be `[AllowAnonymous]`. Client must not send Authorization header for `<img>` tags.

### File Metadata Not Showing
**Solution**: Ensure `FileAttachments` table exists and metadata is persisted on upload. Enable batch metadata queries in frontend.

---

## Contributing

To contribute improvements:

1. **Create a feature branch**: `git checkout -b feature/your-feature`
2. **Make changes** and test thoroughly
3. **Commit with clear messages**: `git commit -m "feat: description"`
4. **Push and create a Pull Request**

---

## License

MIT

---

## Support

For issues, feature requests, or questions:
- Create an issue on GitHub
- Check existing documentation in `/docs`
- Review API examples in `backend/PocketbaseNet.Api.http`
