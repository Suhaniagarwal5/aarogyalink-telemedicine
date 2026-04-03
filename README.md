# AarogyaLink — Rural Telemedicine Scheduler

> Project No. 11 · Health & Emergency · MERN Stack BTech Course — Group Project

---

## Group Details

| | |
|---|---|
| Project Number | 11 |
| Project Title | AarogyaLink — Rural Telemedicine Scheduler |
| Group Number | 7 |
| Team Lead | Suhani Agarwal |
| Members | Gursneh Kaur, Aryaman Bohra, Nidhesh Soni |

---

## The Real Problem

India has over 600,000 villages. Most of them have no doctor. The nearest government hospital or district health centre is often 20–50 km away. A daily-wage farmer or a pregnant woman in a remote village cannot afford to travel that distance every time they need a consultation — losing a day's wage, arranging transport, and waiting for hours at an overcrowded OPD.

ASHA workers (Accredited Social Health Activists) are the last mile of India's health system. They visit homes, track pregnancies, and guide patients — but they have no digital tool to help them book consultations on a patient's behalf.

Meanwhile, doctors at district hospitals have no visibility into how many patients are waiting, who is next, or whether a slot was accidentally double-booked by two people clicking at the same time.

AarogyaLink is built to fix exactly this. It is not a general-purpose telemedicine app. It is designed specifically for the rural public health context — where connectivity is low, users may not be tech-savvy, and the ASHA worker is often the bridge between the patient and the system.

---

## What This Project Builds

AarogyaLink is a full-stack web application where:

- Patients in rural areas can browse available doctors and book a video consultation slot
- ASHA workers can log in and book slots on behalf of the patients they are tracking
- Doctors set their own availability and manage their appointment queue from a dashboard
- After a consultation, the doctor uploads a prescription which the system converts into a downloadable PDF
- Patients and ASHAs can see their live queue position in real time — no refreshing, no guessing

The system is designed to handle a situation that happens constantly in real public health systems: two people trying to book the last available slot at the same moment. Without careful engineering, both could succeed and the doctor ends up double-booked. This project solves that at the database level, not just the UI level.

---

## What the Project Technically Demands

### Concurrent Slot Booking Without Overselling
When two patients (or an ASHA and a patient) attempt to book the same last slot simultaneously, only one must succeed. This is handled using MongoDB's `findOneAndUpdate` with a precondition `{ isBooked: false }` — making the check and the update a single atomic operation. The losing request receives a clear "slot no longer available" response. This is not a UI trick — it is enforced at the database level.

### Redis Caching for Slot Availability
Doctor slot availability is read far more often than it is written. Fetching it from MongoDB on every request is wasteful. Available slots are cached in Redis with immediate invalidation the moment a booking is confirmed. This keeps response times fast even under high load and teaches the cache-aside pattern with real invalidation logic.

### Four-Role Authentication System
The platform has four distinct types of users — Patient, Doctor, ASHA, and Admin — each with a completely different set of permissions and views. A single JWT-based authentication system serves all four, with role-specific middleware guarding every protected route. The ASHA role is particularly important: it can act on behalf of patients, which requires careful authorisation logic to prevent misuse.

### PDF Prescription Generation Without Blocking the Server
Generating a PDF is a CPU-intensive and file I/O heavy operation. Running it on Node's main thread would block the event loop and slow down every other request on the server. Prescriptions are generated using `pdfkit` inside a Node.js Worker Thread — the main thread hands off the job and responds to the client immediately, while the PDF is prepared in the background.

### Appointment Queue Using Redis Sorted Sets
A doctor's upcoming appointments need to be retrieved quickly and in chronological order. Storing them in a Redis Sorted Set keyed by appointment timestamp allows O(log N) retrieval of the next N appointments without touching MongoDB on every queue check. This is how production scheduling systems handle high-frequency reads.

### Live Queue Position via Server-Sent Events
Rather than making patients repeatedly refresh the page to see their queue position, the server pushes updates in real time using Server-Sent Events (SSE). When a doctor marks a consultation as complete and the queue moves forward, every waiting patient's screen updates automatically. SSE is chosen over WebSockets here because the communication is one-directional — the server pushes, the client only listens.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React.js |
| Backend | Node.js, Express.js |
| Database | MongoDB |
| Cache & Queue | Redis |
| Authentication | JSON Web Tokens (JWT) |
| PDF Generation | pdfkit inside Node.js Worker Thread |
| Real-time Updates | Server-Sent Events (SSE) |

---

## MongoDB Collections

**Users** — All four roles stored in a single collection with a `role` field controlling access.

**Slots** — Each document represents one time slot for one doctor, with an `isBooked` boolean used in atomic update operations.

**Appointments** — Confirmed bookings linking a patient (or ASHA-on-behalf), a doctor, and a slot.

**Prescriptions** — Stores the generated PDF path and metadata, linked to a completed appointment.

---

## Getting Started

### Prerequisites
- Node.js v18+
- MongoDB (local or Atlas)
- Redis (local or Redis Cloud)

### Setup

```bash
git clone https://github.com/[your-username]/aarogyalink-telemedicine.git
cd aarogyalink-telemedicine

# Server
cd server && npm install

# Client
cd ../client && npm install
```

### Environment Variables

Create a `.env` file in the `server/` directory:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
REDIS_URL=redis://localhost:6379
```

### Run

```bash
# Backend
cd server && npm run dev

# Frontend (new terminal)
cd client && npm start
```

---

*MERN Stack BTech Course · Group Project 11 · AarogyaLink — Rural Telemedicine Scheduler*
