# CollabBoard — Real-Time Team Collaboration Board

CollabBoard is a modern, high-performance, full-stack real-time project management and Kanban board application. It provides real-time multi-user synchronization, role-based workspace access controls, live presence tracking, full task lifecycle management, comments, subitem checklists, file attachments, time logging, audit activity feeds, and notification delivery.

---

## Tech Stack

### Frontend (`client/`)
- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS v4 + Curated modern design tokens (responsive glassmorphism, dark/light theme support)
- **Drag & Drop**: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` with pointer constraints and collision detection
- **Real-Time Client**: `socket.io-client` with automatic reconnection and state recovery
- **Routing & Networking**: `react-router-dom` v6, `axios` with automatic bearer token injection and `x-socket-id` sender loop exclusion
- **Icons**: `lucide-react`

### Backend (`server/`)
- **Runtime & Framework**: Node.js (ES Modules), Express 4
- **Database & ODM**: MongoDB with Mongoose
- **Real-Time Engine**: Socket.IO with workspace and project room scoping
- **Security & Auth**: Dual-token JWT (short-lived access tokens + HTTP-only refresh cookies), `bcryptjs`, `helmet`, `cors`, `express-rate-limit`
- **Validation**: `zod` schema validation for all endpoints
- **File Uploads**: `multer` with strict MIME validation and secure local storage
- **Email Delivery**: `nodemailer` (Ethereal test accounts for local development; custom SMTP for production)
- **Testing**: Node.js native test runner (`node:test`) + `supertest`

---

## Core Features

- **Workspaces & Role-Based Access Control (RBAC)**:
  - Create and manage team workspaces.
  - Three distinct roles: **Owner** (administrative control, workspace settings, role assignments), **Editor** (full board and task creation/management), and **Viewer** (read-only observer access).
  - Member invitations via email with role assignment.

- **Real-Time Kanban Boards**:
  - Live column and card synchronization across concurrent user sessions.
  - Smooth drag-and-drop reordering within and across columns using `@dnd-kit`.
  - Optimistic UI updates with automatic rollback and user alerts upon network or permission failures.
  - Active user presence badges showing live teammates viewing the board.

- **Comprehensive Task Metadata & Decluttered Hierarchy**:
  - **Task Types**: Bug, Story, Task with distinct color badges.
  - **Priority System**: Urgent, High, Medium, Low indicated via a prominent 4px left border strip.
  - **Labels & Tags**: Multi-label tagging with subtle color chips and compact overflow indicators.
  - **Assignees**: Multi-assignee support with circular avatar stacks and fallback initials.
  - **Due Dates**: Relative date formatting with overdue alerts.

- **Interactive Task Detail Workspace**:
  - **Subitems / Checklists**: Collaborative checklist items with real-time completion progress tracking.
  - **Comments**: Real-time discussion thread with relative timestamps and author deletion permissions.
  - **Attachments**: Drag-and-drop file uploader (PDFs, docs, images, archives up to 10MB) and web link attachments with rich icon previews.
  - **Log Hours (Time Tracking)**: Log hours worked per date with running totals and author-controlled edit history.

- **Audit Trails & Notifications**:
  - **Project Activity Feed**: Slide-out live timeline capturing all creations, moves, updates (with field-level diffs), and comments.
  - **In-App Toast System**: Unobtrusive floating notifications for assignments, errors, and system events.
  - **Live Connection Monitor**: Real-time status indicator showing "Live" or a subtle "Reconnecting..." badge when network connectivity fluctuates.

---

## Project Structure

```
Real-Time Team Collaboration Board/
├── client/                     # Vite + React frontend
│   ├── src/
│   │   ├── api/                # Axios instance & token interceptors
│   │   ├── components/
│   │   │   ├── activity/       # Activity feed & timeline items
│   │   │   ├── common/         # Global Toast and UI primitives
│   │   │   ├── kanban/         # Kanban board, ListColumn, TaskItem
│   │   │   ├── layout/         # AppShell, navigation sidebar & top bar
│   │   │   ├── task/           # Modals: CreateTask, TaskDetail, Subitems, Comments, Attachments, LogHours
│   │   │   └── workspace/      # TeamMembersPanel and invite modals
│   │   ├── context/            # AuthContext, SocketContext, ToastContext
│   │   ├── pages/              # LoginPage, SignupPage, DashboardPage, ProjectPage, AllTasksPage
│   │   └── utils/              # Date formatters, file helpers
│   ├── .env.example
│   └── package.json
│
├── server/                     # Node.js + Express backend
│   ├── src/
│   │   ├── config/             # DB connection, environment loaders
│   │   ├── controllers/        # Route controllers (auth, workspaces, projects, tasks, etc.)
│   │   ├── middleware/         # Auth verification, RBAC guards, multer upload handling
│   │   ├── models/             # Mongoose schemas (User, Workspace, Project, List, Task, etc.)
│   │   ├── routes/             # Express API routers
│   │   ├── services/           # Socket.IO event handlers, email service
│   │   ├── validations/        # Zod validation schemas
│   │   ├── app.js              # Express app configuration
│   │   └── server.js           # Server bootstrap & socket initialization
│   ├── tests/                  # 10 comprehensive test suites (170+ unit & integration tests)
│   ├── uploads/                # Local attachment storage directory
│   ├── .env.example
│   └── package.json
│
└── README.md
```

---

## Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **MongoDB**: Local MongoDB instance (e.g. `mongodb://localhost:27017/collabboard`) or a MongoDB Atlas connection string.

---

### 1. Server Setup

1. Navigate to the `server/` directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

4. Configure the environment variables in `server/.env`:
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # Database (MongoDB Atlas or Local MongoDB)
   MONGO_URI=mongodb://localhost:27017/collabboard

   # JWT Authentication Secrets (Generate secure random 32+ character strings)
   JWT_SECRET=your_jwt_access_secret_key_change_in_production_min_32_chars
   JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_change_in_production_min_32_chars

   # Client CORS Configuration
   CLIENT_URL=http://localhost:5173

   # Email Configuration (Optional: If unset, server generates Ethereal dev credentials automatically)
   # SMTP_HOST=smtp.ethereal.email
   # SMTP_PORT=587
   # SMTP_USER=your_smtp_user
   # SMTP_PASS=your_smtp_password
   # EMAIL_FROM="CollabBoard Support" <noreply@collabboard.com>
   ```

5. Start the backend development server:
   ```bash
   npm run dev
   ```
   The backend API will run on `http://localhost:5000`.

---

### 2. Client Setup

1. Navigate to the `client/` directory in a new terminal:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The client will run on `http://localhost:5173`. Vite is pre-configured to proxy `/api` and `/socket.io` requests to `http://localhost:5000`.

---

### Running Both Concurrently

You can run both client and server in separate terminal tabs, or run:
```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Frontend
cd client && npm run dev
```

---

## Running Tests & Building

### Server Test Suite
CollabBoard includes 10 automated test suites covering authentication, RBAC, task CRUD, move boundaries, real-time Socket.IO broadcasts, comments, subitems, attachments, log hours, and notifications:
```bash
cd server
npm test
```

### Client Production Build
To verify and compile the client production bundle:
```bash
cd client
npm run build
```
The optimized assets will be emitted into `client/dist/`.

---

## Production File Storage Note (Cloud Storage)

> [!IMPORTANT]
> In this repository, file attachments uploaded via `TaskAttachments` are stored locally on disk in `server/uploads/` using Express static delivery (`/uploads/:filename`).
> 
> For multi-instance, containerized, or serverless production deployments (e.g. AWS ECS, Kubernetes, Vercel/Render with ephemeral disks), the local file storage middleware in `server/src/middleware/uploadMiddleware.js` and `server/src/controllers/attachmentController.js` should be replaced with a cloud object storage provider such as **Amazon S3** or **Cloudinary** (e.g. via `multer-s3` or direct presigned S3 upload URLs).

---

## License

This project is licensed under the ISC License.
