# FabLab ENSA - Industrie 4.0 Frontend

Frontend web application for the FabLab ENSA Beni Mellal digital platform. The app provides an immersive 3D lab, machine supervision, G-code simulation, reservation workflows, authentication, and admin dashboards for connected FabLab equipment.

## Tech Stack

- **Next.js 16** with App Router
- **React 19** and **TypeScript**
- **Tailwind CSS v4**
- **shadcn/ui** and **Radix UI** components
- **Three.js / React Three Fiber / Drei** for the 3D lab and simulation views
- **Recharts** for dashboard visualizations
- **TanStack Query** and a lightweight API helper for backend communication
- **Lucide React** icons

## Main Features

- Immersive WebGL FabLab scene with interactive machines.
- Machine catalog and machine detail pages.
- G-code simulation workspace for 3D printer and CNC workflows.
- Student reservation flow with availability slots and cancellation.
- Admin reservation management.
- Admin dashboard with users, machines, reservations, telemetry coverage, anomaly detection, and maintenance risk.
- User management for admin accounts.
- Login, registration, profile, role-aware navigation, notifications, and theme switching.

## Routes

| Route | Page |
| --- | --- |
| `/` | Home |
| `/lab` | Interactive 3D FabLab |
| `/simulation` | G-code simulation workspace |
| `/machines` | Machine list |
| `/machines/[id]` | Machine details |
| `/reservations` | Student reservation page |
| `/admin/reservations` | Admin reservation management |
| `/dashboard` | Admin dashboard and monitoring |
| `/users` | Admin user management |
| `/profile` | User profile |
| `/login` | Login |
| `/register` | Registration |

## Project Structure

```text
app/                         Next.js App Router pages and layouts
components/                  Shared UI, layout, auth, toast, 3D, and simulation components
components/3D_design/        Interactive FabLab scene components
components/simulation/       G-code simulation panels, visuals, and machine rendering
lib/                         API helper, utilities, and simulation engine
public/models/               3D printer and CNC GLB assets
public/sample-gcode/         Demo G-code files for testing simulations
hooks/                       Shared React hooks
```

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Backend Configuration

The frontend reads the backend URL from `NEXT_PUBLIC_API_BASE_URL`.

Create a `.env.local` file when you want to force a specific backend URL:

```bash
NEXT_PUBLIC_API_BASE_URL=http://192.168.1.20:8000
```

If the variable is not set, the app uses the same host as the page with port
`8000`. For example, if another PC opens:

```text
http://192.168.1.20:3000
```

the frontend sends API requests to:

```text
http://192.168.1.20:8000
```

## Available Scripts

```bash
npm run dev      # Start the development server
npm run build    # Build the production app
npm run start    # Start the production server
npm run lint     # Run ESLint
```

## Simulation Assets

The simulation and 3D lab use assets from:

- `public/models/3d_printer.glb`
- `public/models/CNC.glb`
- `public/sample-gcode/sliced-vase-demo.gcode`
- `public/sample-gcode/simple-square.gcode`

These files are useful for quickly testing the 3D printer and CNC simulation flows.

## Notes

- Admin-only pages redirect non-admin users away from protected dashboards and management views.
- Student users can access reservations and notifications.
- Machine monitoring data is loaded from backend API endpoints, including telemetry and AI monitoring overview data.
