# ZISUN Frontend (Next.js 14 App Router)

This is the frontend Progressive Web App (PWA) for the ZISUN Content-Driven Commerce Platform.

## Architecture
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS + Framer Motion
- **State Management:** Zustand (for Cart & Auth state)
- **Data Fetching:** Axios + SWR/React Query (pending)

## Setup Instructions

⚠️ **Node.js is Required**
You must install Node.js (v18+) to run this project.

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Design Philosophy (MVP)
The UI is strictly locked to a mobile-first `max-w-md mx-auto` container to replicate a native app feel on desktop, while filling the entire viewport on mobile devices. This constraint forces the design to remain tightly aligned with the "Shoppable Instagram/TikTok Feed" product vision.
