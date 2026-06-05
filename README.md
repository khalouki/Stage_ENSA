# PFE Projet - FabLab Digital Twin

This project is split into two main folders:

- `backend/`: FastAPI API, database models, telemetry ingestion, MQTT subscriber, AI monitoring, and simulator scripts.
- `Frontend/`: Next.js web application for users, admins, machines, reservations, simulation, profile, and dashboard views.

## Project Structure

```text
PFE_Projet/
  backend/
    app/
      main.py                 FastAPI app entry point
      db.py                   SQLite database setup and seed data
      routes/                 API endpoints
      services/               Business logic and AI/telemetry services
      schemas/                Pydantic request/response schemas
      models/                 SQLModel database models
      core/                   Config and security helpers
    scripts/
      mqtt_simulator.py       MQTT telemetry simulator
      train_ml_models.py      ML model training script
    ml_models/                Trained model files
    data/                     Telemetry datasets
    fablab.db                 Local SQLite database
    requirements.txt          Python dependencies

  Frontend/
    app/                      Next.js app routes and pages
    components/               React components organized by feature
    lib/                      API helper, schemas, utilities, simulation core
    hooks/                    Shared React hooks
    public/                   Images, models, sample G-code files
    package.json              Frontend scripts and dependencies
```

## Backend

The backend is a FastAPI application. It handles authentication, users, machines, reservations, notifications, MQTT telemetry, anomaly detection, AI monitoring, and maintenance recommendations.

### Main Backend Folders

```text
backend/app/routes/           API route files
backend/app/services/         Core backend logic
backend/app/models/           Database models
backend/app/schemas/          API schemas
backend/scripts/              Utility scripts and MQTT simulator
```

Important files:

- `backend/app/main.py`: creates the FastAPI app and registers routes.
- `backend/app/routes/auth.py`: login, register, profile update, password change.
- `backend/app/routes/ai.py`: AI monitoring and model endpoints.
- `backend/app/services/predictive_service.py`: dashboard risk and recommendation logic.
- `backend/app/services/mqtt_service.py`: MQTT subscriber.
- `backend/scripts/mqtt_simulator.py`: realistic telemetry publisher.

### Run Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

`python run.py` starts the API on all network interfaces. Another PC on the
same network can reach it by using your computer IP:

```text
http://YOUR_PC_IP:8000
```

Default admin account:

```text
email: admin@fablab.local
password: Admin@123
```

### Run MQTT Simulator

The simulator publishes telemetry to:

```text
fablab/machines/{machine_id}/data
```

Command:

```bash
cd backend
python3 scripts/mqtt_simulator.py --broker-host localhost --broker-port 1883 --interval 4 --machines "3D_Printer_1,CNC_1"
```

Payload fields:

```json
{
  "machine_id": "CNC_1",
  "temperature": 52.94,
  "vibration": 4.27,
  "usage_duration": 32,
  "motor_speed": 1331.13,
  "error": null,
  "timestamp": "2026-05-10T16:01:22Z",
  "status": "RUNNING"
}
```

## Frontend

The frontend is a Next.js application using React, TypeScript, Tailwind CSS, shadcn/ui, Radix UI, Lucide icons, and Three.js for 3D views.

### Main Frontend Folders

```text
Frontend/app/                 Pages and layouts
Frontend/components/ui/       Reusable UI components
Frontend/components/layout/   Navbar, footer, app layout
Frontend/components/auth/     Auth provider and user session
Frontend/components/profile/  Profile and password forms
Frontend/components/app-shell/ Theme, splash screen, page transitions
Frontend/components/3D_design/ Interactive 3D lab
Frontend/components/simulation/ G-code simulation UI
Frontend/components/machines/ Machine cards and G-code modal
Frontend/lib/                 API helper, schemas, utilities
```

Important files:

- `Frontend/app/layout.tsx`: global layout and providers.
- `Frontend/app/page.tsx`: home page.
- `Frontend/app/dashboard/page.tsx`: admin dashboard and recommendations display.
- `Frontend/app/profile/page.tsx`: user profile page.
- `Frontend/components/auth/AuthProvider.tsx`: login state and token handling.
- `Frontend/lib/api.ts`: backend API request helper.

### Run Frontend

```bash
cd Frontend
npm install
npm run dev
```

Default frontend URL:

```text
http://localhost:3000
```

### Backend URL Configuration

The frontend uses this environment variable:

```text
NEXT_PUBLIC_API_BASE_URL=http://YOUR_PC_IP:8000
```

If it is not set, the frontend uses the same host as the opened page with port
`8000`. For example, opening:

```text
http://192.168.1.20:3000
```

makes API requests to:

```text
http://192.168.1.20:8000
```

Create `Frontend/.env.local` if needed:

```bash
NEXT_PUBLIC_API_BASE_URL=http://YOUR_PC_IP:8000
```

## Main Routes

Frontend routes:

```text
/                     Home
/lab                  Interactive 3D FabLab
/simulation           G-code simulation
/machines             Machine list
/machines/[id]        Machine details
/reservations         Student reservations
/admin/reservations   Admin reservation management
/dashboard            Admin AI monitoring dashboard
/users                Admin user management
/profile              User profile
/login                Login
/register             Register
```

Backend API groups:

```text
/auth                 Authentication and profile
/machines             Machine catalog
/reservations         Student reservations
/admin                Admin users and reservations
/notifications        User notifications
/monitoring           Telemetry and MQTT status
/admin/ai             AI monitoring and model endpoints
```

## Typical Development Workflow

1. Start the backend:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

2. Start the frontend:

```bash
cd Frontend
npm run dev
```

3. Optional: start MQTT broker and simulator for live telemetry:

```bash
cd backend
python3 scripts/mqtt_simulator.py --broker-host localhost --broker-port 1883 --interval 4 --machines "3D_Printer_1,CNC_1"
```

4. Open the app:

```text
http://localhost:3000
```

## Notes

- The dashboard recommendations are generated by backend AI services and displayed in the frontend dashboard.
- Telemetry can come from MQTT messages and is stored in the local SQLite database.
- The frontend keeps authentication tokens in browser local storage.
- Admin pages require an admin user.
