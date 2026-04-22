# CLAUDE.md — MedSeg

Medical image segmentation platform for radiologists. Three-tier architecture: Angular frontend → Express/MongoDB backend → Flask/PyTorch ML service.

## Architecture

```
client/          Angular 21 SPA (port 4200)
backend/         Express + MongoDB API (port 5002)
ml_service/      Flask + MedSAM inference (port 5001)
uploads/         Shared filesystem (raw/, masks/, support_sets/)
BCDU-Net/        Archived research — not used
```

### Data Flow
1. User uploads medical image → backend (Multer, stored in `uploads/raw/<caseId>/`)
2. Backend POSTs to Flask `/segment` with image path
3. Flask runs MedSAM inference, writes mask to `uploads/masks/<caseId>/`
4. Backend updates MongoDB case status → frontend displays result

### Case Status Lifecycle
`created` → `uploading` → `processing` → `completed` | `error`

---

## Running the Project

**All services at once:**
```bash
npm install && npm run start
```
(Uses `concurrently` from root `package.json`)

**Individual services:**
```bash
# Backend
cd backend && npm install && npm run start

# ML Service (requires venv setup first — see below)
cd ml_service && source venv/bin/activate && python app.py

# Frontend
cd client && npm install && npm run start
```

**ML Service first-time setup:**
```bash
cd ml_service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python download_model.py   # downloads ~350MB medsam_vit_b.pth from HuggingFace
```

---

## Environment Variables

**`backend/.env`** (required, no `.env.example` exists):
```
PORT=5002
MONGODB_URI=mongodb://localhost:27017/medseg
JWT_SECRET=medseg_prototype_secret_key_2024
FLASK_URL=http://localhost:5001
UPLOAD_DIR=../uploads
```

Frontend API URLs are hardcoded in `client/src/app/services/auth.ts` and `case.ts` pointing to `http://localhost:5002`.

---

## Key Files

| File | Purpose |
|------|---------|
| `backend/server.js` | Express entry point, mounts `/api/auth` and `/api/cases` |
| `backend/config/db.js` | MongoDB connection |
| `backend/middleware/auth.js` | JWT verification middleware |
| `backend/models/User.js` | User schema (radiologist) |
| `backend/models/Case.js` | Case schema with embedded patientDetails |
| `backend/routes/auth.js` | Register, login, profile endpoints |
| `backend/routes/cases.js` | Case CRUD + segmentation trigger |
| `backend/services/flaskService.js` | HTTP client to ML service |
| `client/src/app/app.routes.ts` | Angular route definitions |
| `client/src/app/app.config.ts` | DI providers + routing config |
| `client/src/app/services/auth.ts` | Auth service (JWT stored in localStorage) |
| `client/src/app/services/case.ts` | Case service (upload, segment, list) |
| `client/src/app/interceptors/auth.interceptor.ts` | Injects Bearer token on all requests |
| `client/src/app/guards/auth-guard.ts` | Protects private routes |
| `ml_service/app.py` | Flask entry point (port 5001) |
| `ml_service/inference.py` | MedSAM model + prediction logic |
| `ml_service/utils.py` | Image preprocessing (resize to 1024×1024, Otsu bbox) |

---

## Angular Components

| Component | Route | Description |
|-----------|-------|-------------|
| `landing/` | `/` | Public welcome page |
| `login/` | `/login` | Login form |
| `register/` | `/register` | Registration form |
| `dashboard/` | `/dashboard` | Stats + quick actions (protected) |
| `new-case/` | `/new-case` | Create case + upload images (protected) |
| `case-viewer/` | `/case/:id` | View segmentation results (protected) |
| `history/` | `/history` | Browse past cases (protected) |
| `profile/` | `/profile` | User profile settings (protected) |

---

## Tech Stack

- **Frontend:** Angular 21.1.0, TypeScript 5.9.2, RxJS 7.8.0, SCSS
- **Backend:** Node.js, Express 5.2.1, Mongoose 9.2.1, JWT, bcryptjs, Multer (50MB limit, 20 files max)
- **ML Service:** Python 3.8+, Flask 3.0.0, PyTorch, MedSAM (ViT-B), OpenCV, Pillow
- **Database:** MongoDB — collections: `users`, `cases`
- **Device:** CUDA > MPS (Apple Silicon) > CPU (auto-detected at Flask startup)

---

## API Endpoints

**Backend (Express):**
- `GET  /api/health` — health check
- `POST /api/auth/register` — create account
- `POST /api/auth/login` — returns JWT
- `GET  /api/auth/profile` — get profile (auth required)
- `PUT  /api/auth/profile` — update profile (auth required)
- `POST /api/cases` — create case (auth required)
- `POST /api/cases/:id/upload` — upload images (auth required)
- `POST /api/cases/:id/segment` — trigger segmentation (auth required)
- `GET  /api/cases` — list user's cases (auth required)
- `GET  /api/cases/:id` — get case detail (auth required)
- `DELETE /api/cases/:id` — delete case (auth required)
- `GET  /uploads/*` — static file serving

**ML Service (Flask):**
- `GET  /health` — health check
- `POST /segment` — run inference (called by backend only)

---

## Supported Image Formats & Modalities

- **Image formats:** PNG, JPG, JPEG only
- **Modalities:** CT, MRI, X-Ray, Ultrasound, Microscopy, Other

---

## Tests

No test suite configured for backend. Frontend uses Karma/Jasmine (configured but minimal). ML service has `test_data/` with sample images.

```bash
cd client && npm test   # Angular unit tests
```

---

## Notes

- `uploads/` is shared between backend (writes images) and ML service (reads images, writes masks). Files are not auto-cleaned; deletion happens via the case delete endpoint.
- Frontend has no environment file — API URL changes require editing the service files directly.
- `BCDU-Net/` is archived research material, not part of the running application.
- Model weights (`ml_service/weights/medsam_vit_b.pth`, ~350MB) are gitignored and must be downloaded before first run.
