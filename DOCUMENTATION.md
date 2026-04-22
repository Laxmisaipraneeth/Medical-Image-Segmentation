# MedSeg — Project Documentation

MedSeg is a three-tier medical image segmentation platform for radiologists. A user uploads a medical image (CT / MRI / X-Ray / Ultrasound / Microscopy), a bounding-box prompt is derived automatically from the image, and a pretrained MedSAM (Segment Anything, ViT-B) model produces a binary segmentation mask that the user can overlay on the original image in the browser.

- **Frontend** — Angular 21 SPA, port **4200**
- **Backend** — Express 5 + MongoDB + JWT, port **5002**
- **ML Service** — Flask + PyTorch + MedSAM, port **5001**
- **Shared storage** — local filesystem under `uploads/` (served as a static folder by the backend)

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Repository Layout](#2-repository-layout)
3. [Technology Stack](#3-technology-stack)
4. [Backend (Express)](#4-backend-express)
5. [ML Service (Flask + MedSAM)](#5-ml-service-flask--medsam)
6. [Model Architecture (MedSAM / ViT-B)](#6-model-architecture-medsam--vit-b)
7. [Frontend (Angular)](#7-frontend-angular)
8. [End-to-End Data Flow](#8-end-to-end-data-flow)
9. [Complete API Reference](#9-complete-api-reference)
10. [Setup & Running](#10-setup--running)
11. [Known Notes & Inconsistencies](#11-known-notes--inconsistencies)

---

## 1. System Architecture

```
┌────────────────────────┐        ┌────────────────────────┐        ┌────────────────────────┐
│   Angular SPA          │  HTTP  │   Express API          │  HTTP  │   Flask ML Service     │
│   localhost:4200       │ ─────► │   localhost:5002       │ ─────► │   localhost:5001       │
│                        │  JWT   │                        │        │                        │
│   Auth, forms, viewer  │        │   Auth, cases, uploads │        │   MedSAM inference     │
└───────────┬────────────┘        └───────────┬────────────┘        └───────────┬────────────┘
            │                                 │                                 │
            │ static GET /uploads/...         │ reads/writes uploads/           │ reads uploads/raw,
            │                                 │                                 │ writes uploads/masks
            │                                 ▼                                 │
            │                        ┌────────────────────┐                     │
            │                        │   MongoDB          │                     │
            │                        │   (users, cases)   │                     │
            │                        └────────────────────┘                     │
            │                                                                   │
            └────────────── shared filesystem: ./uploads/ ──────────────────────┘
                                   (raw/, masks/, support_sets/)
```

### Case status lifecycle

```
created ──▶ uploading ──▶ processing ──▶ completed
                                 │
                                 └──────▶ error (errorMessage populated)
```

Transitions live in [backend/routes/cases.js](backend/routes/cases.js):

- `created` — set by `POST /api/cases` when the patient record is first saved.
- `uploading` — set by `POST /api/cases/:caseId/upload` once images are written to disk.
- `processing` — set right before the backend calls the Flask service.
- `completed` — set when Flask returns mask paths.
- `error` — set if Flask throws; `errorMessage` stores the reason.

---

## 2. Repository Layout

```
MAJOR_PROJECT/
├── backend/                    Express API
│   ├── config/db.js            MongoDB connector
│   ├── middleware/auth.js      JWT verification
│   ├── models/                 Mongoose schemas (User, Case)
│   ├── routes/                 auth.js, cases.js
│   ├── services/flaskService.js  HTTP client to the ML service
│   ├── server.js               Entry point
│   └── package.json
├── ml_service/                 Flask + PyTorch MedSAM
│   ├── app.py                  Flask entry point
│   ├── inference.py            Model load + predict
│   ├── utils.py                Preprocess / bbox / save
│   ├── download_model.py       Pulls ViT-B weights from HuggingFace
│   ├── weights/                Pretrained checkpoint (gitignored, ~350 MB)
│   ├── test_data/              Sample images
│   └── requirements.txt
├── client/                     Angular 21 SPA
│   └── src/app/
│       ├── app.{ts,html,scss,config.ts,routes.ts}
│       ├── components/         landing, login, register, dashboard,
│       │                       new-case, case-viewer, history, profile
│       ├── services/           auth.ts, case.ts
│       ├── guards/auth-guard.ts
│       └── interceptors/auth.interceptor.ts
├── uploads/                    Shared runtime storage
│   ├── raw/<caseId>/           Original uploaded images
│   ├── masks/<caseId>/         Output segmentation masks
│   └── support_sets/<caseId>/  Support images + labels (currently unused by model)
├── BCDU-Net/                   Archived research, NOT part of the running app
├── CLAUDE.md                   Quick reference
└── package.json                Root: `concurrently` launches all three tiers
```

---

## 3. Technology Stack

| Tier | Stack | Version highlights |
|---|---|---|
| Frontend | Angular standalone components, TypeScript, RxJS, SCSS, Material Symbols Rounded | Angular 21.1.0, TypeScript 5.9.2, RxJS 7.8.0 |
| Backend | Node.js + Express + Mongoose + JWT + Multer | Express 5.2.1, Mongoose 9.2.1, Multer 2.0.2 (50 MB, ≤20 files), jsonwebtoken 9.0.3, bcryptjs 3.0.3 |
| ML Service | Flask + flask-cors + PyTorch + segment-anything + OpenCV + Pillow | Flask 3.0.0, flask-cors 4.0.0, `segment-anything` from Meta's GitHub |
| Database | MongoDB — collections `users`, `cases` | default URI `mongodb://localhost:27017/medseg` |
| Device | Auto-select: CUDA → MPS (Apple Silicon) → CPU | via `torch.cuda.is_available()` / `torch.backends.mps.is_available()` |
| Supported image formats | PNG, JPG, JPEG | enforced by Multer `fileFilter` and Angular `accept=".png,.jpg,.jpeg"` |
| Supported modalities | CT, MRI, X-Ray, Ultrasound, Microscopy, Other | enforced by the Mongoose `modality` enum |

---

## 4. Backend (Express)

### 4.1 Entry point — [backend/server.js](backend/server.js)

Middleware chain, in order:

1. `cors({ origin: true, credentials: true })` — permissive CORS with credentials.
2. `express.json({ limit: '50mb' })` and `express.urlencoded({ extended: true, limit: '50mb' })` — accept large JSON/form bodies.
3. `express.static(path.resolve(__dirname, '../uploads'))` mounted at **`/uploads`** — exposes raw images and output masks to the browser.
4. Routers mounted at `/api/auth` and `/api/cases`.
5. A health endpoint at `GET /api/health`.
6. A final error handler that returns `400` for `MulterError` (file-upload errors) and `500` for everything else.

### 4.2 Database connection — [backend/config/db.js](backend/config/db.js)

Calls `mongoose.connect(process.env.MONGODB_URI)` and `process.exit(1)` on failure — the backend refuses to stay up without Mongo.

### 4.3 Data models

#### User — [backend/models/User.js](backend/models/User.js)

| Field | Type | Rules |
|---|---|---|
| `name` | String | required, trimmed |
| `email` | String | required, **unique**, lowercased, trimmed |
| `password` | String | required, `minlength: 6`; **bcrypt-hashed** in a `pre('save')` hook (salt rounds = 10) |
| `hospital` | String | required, trimmed |
| `specialization` | String | required, trimmed |
| `createdAt` | Date | defaults to `Date.now` |

- `userSchema.methods.comparePassword(candidate)` wraps `bcrypt.compare`.
- `userSchema.methods.toJSON()` strips the password so it never leaks in responses.

#### Case — [backend/models/Case.js](backend/models/Case.js)

| Field | Type | Notes |
|---|---|---|
| `radiologistId` | `ObjectId` ref `User` | required — the owner of the case |
| `patientDetails.patientName` | String | required |
| `patientDetails.patientId` | String | required |
| `patientDetails.age` | Number | required |
| `patientDetails.gender` | Enum `['Male','Female','Other']` | required |
| `patientDetails.modality` | Enum `['CT','MRI','X-Ray','Ultrasound','Microscopy','Other']` | required |
| `patientDetails.bodyPart` | String | required |
| `patientDetails.clinicalNotes` | String | default `""` |
| `patientDetails.studyDate` | Date | required |
| `originalImages[]` | String | filesystem paths to uploaded images |
| `supportImages[]` | String | filesystem paths to support-set images (accepted but not consumed by the model today — see §11) |
| `supportLabels[]` | String | filesystem paths to support-set masks (same) |
| `segmentedImages[]` | String | filesystem paths to output masks |
| `status` | Enum `['created','uploading','processing','completed','error']` | default `'created'` |
| `errorMessage` | String | default `""` |
| `createdAt` | Date | default `Date.now` |

Compound index: `{ radiologistId: 1, createdAt: -1 }` — used by `GET /api/cases` for per-user, newest-first listings.

### 4.4 JWT middleware — [backend/middleware/auth.js](backend/middleware/auth.js)

Reads `Authorization: Bearer <token>`, verifies it against `JWT_SECRET`, attaches `req.userId = decoded.userId`, and returns `401` if missing / malformed / expired. Applied to all routes in `routes/cases.js` via `router.use(authMiddleware)` and to the `profile` endpoints in `routes/auth.js`.

### 4.5 Auth routes — [backend/routes/auth.js](backend/routes/auth.js)

| Endpoint | Auth | Body / Behavior |
|---|---|---|
| `POST /api/auth/register` | public | Creates a user, signs a JWT with `{ userId }` and `expiresIn: '7d'`. `201` on success; `400` if the email is already registered. |
| `POST /api/auth/login` | public | Verifies email + password via `user.comparePassword`. Returns the same `{ token, user }` envelope. `401` on invalid credentials (no distinction between "user not found" and "bad password"). |
| `GET /api/auth/profile` | required | Returns the current user (minus password). |
| `PUT /api/auth/profile` | required | Updates name / hospital / specialization using `runValidators: true`. |

Tokens are always returned as `{ message, token, user }`.

### 4.6 Case routes — [backend/routes/cases.js](backend/routes/cases.js)

All case routes require a valid JWT. Multer is configured as follows:

- **Storage destination** — files for fieldname `supportImages` / `supportLabels` go under `uploads/support_sets/<caseId>/`; everything else goes under `uploads/raw/<caseId>/`. Directories are created with `fs.mkdirSync(..., { recursive: true })`.
- **Filename** — `uuidv4() + original extension`. Support labels are prefixed with `label_`.
- **File filter** — only `.png`, `.jpg`, `.jpeg` are accepted; anything else fails with `'Only PNG, JPG, JPEG files are allowed'`.
- **Limits** — `fileSize: 50 * 1024 * 1024` (50 MB per file); `maxCount: 20` per field on the upload route.

Endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /api/cases` | Create a case with `patientDetails`. Status starts at `created`. |
| `POST /api/cases/:caseId/upload` | Multipart upload with three fields — `images`, `supportImages`, `supportLabels` (each up to 20). Sets `originalImages[]` / `supportImages[]` / `supportLabels[]` with absolute paths and moves status to `uploading`. |
| `POST /api/cases/:caseId/segment` | Sets status to `processing`, creates `uploads/masks/<caseId>/`, calls the Flask service, stores returned `mask_paths` in `segmentedImages`, sets status to `completed`. On error, sets status to `error` and stores the message. |
| `GET /api/cases` | Lists all cases owned by the current user, sorted by `createdAt` descending. Uses `.lean()` for performance. |
| `GET /api/cases/:caseId` | Fetches a single case; returns `404` if the case isn't owned by `req.userId`. |
| `DELETE /api/cases/:caseId` | Deletes the Mongo document and recursively removes the three on-disk directories (`raw/<caseId>`, `masks/<caseId>`, `support_sets/<caseId>`). |

### 4.7 Flask client — [backend/services/flaskService.js](backend/services/flaskService.js)

One function, `runSegmentation(imagePaths, supportImagePaths, supportLabelPaths)`, posts to `${FLASK_URL}/segment` (default `http://localhost:5001`) with:

```json
{
  "image_paths": ["/abs/path/to/img1.png"],
  "support_image_paths": [],
  "support_label_paths": []
}
```

- **Timeout** — 120 000 ms (2 min).
- **On Flask-reported error** — rethrows `error.response.data.error`.
- **On network failure** — rethrows `'ML service unavailable. Ensure Flask is running on port 5001.'`

### 4.8 Environment variables (`backend/.env`)

```
PORT=5002
MONGODB_URI=mongodb://localhost:27017/medseg
JWT_SECRET=medseg_prototype_secret_key_2024
FLASK_URL=http://localhost:5001
UPLOAD_DIR=../uploads
```

No `.env.example` is checked in; the values above are the canonical defaults.

---

## 5. ML Service (Flask + MedSAM)

### 5.1 Entry point — [ml_service/app.py](ml_service/app.py)

- Flask app + `flask-cors` with defaults.
- `UPLOAD_DIR` resolves to the sibling `uploads/` folder (`../uploads` relative to `ml_service/`).
- `@app.before_request` calls `get_model()` so the model is loaded on the first request, not at import time.
- At `__main__` it also eagerly calls `get_model()` before `app.run(host='0.0.0.0', port=5001, threaded=True)`.

Endpoints:

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/health` | Returns `{ "status": "ok", "model_loaded": true/false }`. |
| `POST` | `/segment` | Validates that every path in `image_paths` / `support_image_paths` / `support_label_paths` exists on disk, derives the output directory `uploads/masks/<caseId>/` from the **parent folder name of the first image**, runs inference, and responds with `{ "mask_paths": [...], "count": N }`. On error, responds `500` with `{ "error": "<message>" }`. |

### 5.2 Model loader — [ml_service/inference.py](ml_service/inference.py)

```python
device = "cuda" if torch.cuda.is_available() else \
         "mps"  if torch.backends.mps.is_available() else \
         "cpu"
```

`get_model()`:

1. If `weights/medsam_vit_b.pth` isn't present, calls `download_model()` which fetches the checkpoint from HuggingFace:
   `https://huggingface.co/SansuiHan/medical_models/resolve/main/medsam_vit_b.pth` (≈350 MB).
2. Builds the SAM ViT-B architecture with `sam_model_registry["vit_b"](checkpoint=None)`.
3. `torch.load(model_path, map_location=device, weights_only=True)` and `load_state_dict` apply the MedSAM weights into the SAM architecture.
4. `.to(device).eval()`, wrapped in `SamPredictor(sam_model)`.
5. The predictor is cached in a module-level global, so subsequent calls are free.

### 5.3 Inference loop — `run_inference(...)`

For each image path:

1. `img_np = utils.load_and_preprocess(img_path, target_size=1024)` — load → RGB → bilinear resize to **1024×1024** → `uint8` array of shape `(1024, 1024, 3)`.
2. `original_size = utils.get_original_size(img_path)` — the original `(width, height)` so we can restore aspect-ratio on output.
3. `bbox = utils.generate_bounding_box(img_np)` — auto-derived from Otsu thresholding (see §6.3).
4. `predictor.set_image(img_np)` — runs the ViT-B encoder once, caching the image embedding.
5. `masks, iou_predictions, low_res_masks = predictor.predict(box=bbox, multimask_output=False)` — single-mask output, shape `(1, 1024, 1024)`, dtype `bool`.
6. `utils.save_mask(masks[0].astype(float32), out_path, original_size=original_size)` — scales to `[0, 255]` uint8, **nearest-neighbor** resizes back to the original image dimensions (preserves hard mask edges), writes as a grayscale PNG.

Output files are named `mask_<original_filename>.png` inside `uploads/masks/<caseId>/`.

### 5.4 Utilities — [ml_service/utils.py](ml_service/utils.py)

- `load_and_preprocess(path, target_size=1024)` — `PIL.Image.open(...).convert('RGB').resize((1024, 1024), BILINEAR)` → `np.uint8[H, W, 3]` in `[0, 255]`. (The docstring mentions `[0,1]` normalization, but the actual normalization happens inside SAM's encoder using the library's built-in ImageNet statistics.)
- `generate_bounding_box(image_array, margin=20)` — see §6.3.
- `save_mask(mask_array, output_path, original_size=None)` — `(mask * 255).astype(uint8)` → `PIL.Image.fromarray(..., mode='L')` → optional `Image.NEAREST` resize to `original_size` → PNG.
- `get_original_size(path)` — returns `(width, height)` of the source file.

### 5.5 Dependencies — [ml_service/requirements.txt](ml_service/requirements.txt)

```
Flask==3.0.0
flask-cors==4.0.0
numpy
Pillow
opencv-python
torch
torchvision
segment-anything @ git+https://github.com/facebookresearch/segment-anything.git
```

`segment-anything` is pulled from Meta's GitHub so `sam_model_registry["vit_b"]` and `SamPredictor` are available.

---

## 6. Model Architecture (MedSAM / ViT-B)

MedSAM is a medical-domain fine-tune of Meta's Segment Anything Model. It reuses SAM's three-part architecture and is loaded via Meta's `segment-anything` library exactly like standard SAM — only the weights differ.

### 6.1 Three-part architecture

```
                            ┌────────────────────────────┐
  1024×1024 RGB image ────▶ │   Image Encoder (ViT-B)    │ ──▶ image embedding (64×64×256)
                            └────────────────────────────┘
                                                                          │
  bbox [x1,y1,x2,y2] ──▶  Prompt Encoder  ──▶ prompt embeddings           │
                                                │                         │
                                                ▼                         ▼
                                         ┌────────────────────────────────────┐
                                         │   Mask Decoder (2 transformer      │
                                         │   blocks + upsampling conv head)   │
                                         └────────────────┬───────────────────┘
                                                          │
                                                          ▼
                                                  binary mask (1024×1024)
```

| Component | Role in this code path |
|---|---|
| **Image Encoder (ViT-B)** | A Vision Transformer (ViT-Base, ≈90 M params of the total). Processes the 1024×1024 input into a 64×64×256 dense embedding. The `set_image` call runs this encoder exactly once per image — subsequent `predict` calls are cheap. |
| **Prompt Encoder** | Accepts points, boxes, or coarse masks and encodes them into prompt tokens. In this codebase we pass a **bounding box only** (`box=bbox`, no `point_coords` / `point_labels`). |
| **Mask Decoder** | A lightweight two-block transformer plus upsampling convolutions that cross-attends the prompt tokens against the image embedding to produce the final high-resolution binary mask. With `multimask_output=False`, it emits a single mask + IoU score rather than SAM's three-candidate ambiguity output. |

### 6.2 Input / output contract

| Tensor | Shape | dtype | Range | Source |
|---|---|---|---|---|
| Input image | `(1024, 1024, 3)` | `uint8` | `[0, 255]` | `utils.load_and_preprocess` (PIL + bilinear) |
| Input bbox | `(4,)` int | — | pixels in the 1024-space | `utils.generate_bounding_box` |
| Output `masks` | `(1, 1024, 1024)` | `bool` | {False, True} | `SamPredictor.predict` |
| Output `iou_predictions` | `(1,)` float | — | `[0, 1]` | not used by the backend |
| Output `low_res_masks` | `(1, 256, 256)` | float | logits | not used |
| Saved PNG | `(H_orig, W_orig)` | `uint8` | {0, 255} | `utils.save_mask` with nearest-neighbor resize |

### 6.3 Automatic bounding-box prompt

SAM normally expects an **interactive** prompt (the user clicks a point or drags a box). MedSeg avoids the UI round-trip by deriving the box automatically from image content — this is where the tool becomes "upload and go":

```python
def generate_bounding_box(image_array, margin=20):
    gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        largest = max(contours, key=cv2.contourArea)
        x, y, bw, bh = cv2.boundingRect(largest)
        if bw * bh > 0.05 * h * w:
            return np.array([max(0, x - margin), max(0, y - margin),
                             min(w, x + bw + margin), min(h, y + bh + margin)])
    m = min(h, w) // 10
    return np.array([m, m, w - m, h - m])   # fallback: full-image minus 10% inset
```

Step by step:

1. **Grayscale** the 1024×1024 RGB array.
2. **Otsu thresholding** (`cv2.THRESH_OTSU`) picks an intensity cutoff automatically — ideal for medical images that sit on a dark background.
3. **External contours** (`RETR_EXTERNAL`) of the binary mask; the **largest by area** is the putative region of interest.
4. **Sanity filter** — if that region is ≤ 5 % of the image, fall back to a 90 % inset of the full frame (covers the case where the image is low-contrast or Otsu fails).
5. **Margin** — pad the detected rectangle by `margin=20` px, clamped to image bounds.

### 6.4 Model weights

- File: `ml_service/weights/medsam_vit_b.pth` (≈350 MB)
- Source: HuggingFace — [`SansuiHan/medical_models/medsam_vit_b.pth`](https://huggingface.co/SansuiHan/medical_models)
- Loaded with `torch.load(..., weights_only=True)` (safe mode)
- **Gitignored** — first-time setup must run `python download_model.py` (see §10).

---

## 7. Frontend (Angular)

Angular 21 SPA using **standalone components** (no NgModules). Bootstrap happens in [client/src/main.ts](client/src/main.ts):

```ts
bootstrapApplication(AppComponent, appConfig).catch(err => console.error(err));
```

### 7.1 App shell

[client/src/app/app.config.ts](client/src/app/app.config.ts) registers four providers:

```ts
providers: [
  provideBrowserGlobalErrorListeners(),
  provideZoneChangeDetection({ eventCoalescing: true }),
  provideRouter(routes),
  provideHttpClient(withInterceptors([authInterceptor])),
]
```

[client/src/app/app.ts](client/src/app/app.ts) injects `AuthService` publicly so [client/src/app/app.html](client/src/app/app.html) can branch on `auth.isLoggedIn`:

- **Authenticated view** — 260 px glass-morphism sidebar (brand + four nav links + user card + Logout) plus `<router-outlet>`.
- **Public view** — just `<router-outlet>` (used by `/`, `/login`, `/register`).

### 7.2 Routing — [client/src/app/app.routes.ts](client/src/app/app.routes.ts)

| Path | Component | Guard |
|---|---|---|
| `` | `LandingComponent` | — |
| `login` | `LoginComponent` | — |
| `register` | `RegisterComponent` | — |
| `dashboard` | `DashboardComponent` | `authGuard` |
| `new-case` | `NewCaseComponent` | `authGuard` |
| `case/:id` | `CaseViewerComponent` | `authGuard` |
| `history` | `HistoryComponent` | `authGuard` |
| `profile` | `ProfileComponent` | `authGuard` |
| `**` | redirect to `` | — |

### 7.3 Guard & interceptor

- [client/src/app/guards/auth-guard.ts](client/src/app/guards/auth-guard.ts) — returns `true` if `authService.isLoggedIn`, otherwise redirects to `/login`.
- [client/src/app/interceptors/auth.interceptor.ts](client/src/app/interceptors/auth.interceptor.ts) — reads `localStorage.getItem('token')` and, when present, clones the request with `Authorization: Bearer <token>`. Applied to **every** HTTP call via `provideHttpClient(withInterceptors([authInterceptor]))`.

### 7.4 Services

#### `AuthService` — [client/src/app/services/auth.ts](client/src/app/services/auth.ts)

- Base URL hard-coded to `http://localhost:5002/api/auth`.
- State — a `BehaviorSubject<User | null>` seeded from `localStorage.getItem('user')` on construction; exposed as `user$`.
- Token storage — plain `localStorage.getItem('token')` / `setItem('token', ...)`.
- Methods — `register(data)`, `login(email, password)`, `getProfile()`, `updateProfile(data)`, `logout()` (clears localStorage + subject and navigates to `/login`).
- Getters — `token`, `isLoggedIn` (`!!this.token`), `currentUser`.

#### `CaseService` — [client/src/app/services/case.ts](client/src/app/services/case.ts)

- Base URL hard-coded to `http://localhost:5002/api/cases`.
- TypeScript interfaces — `PatientDetails`, `MedCase` (mirror the Mongoose schema).
- Methods — `createCase(patientDetails)`, `uploadFiles(caseId, images, supportImages, supportLabels)` which constructs a `FormData` with three repeated field names (`images`, `supportImages`, `supportLabels`), `runSegmentation(caseId)`, `getCases()`, `getCase(caseId)`, `deleteCase(caseId)`.

> **Note:** Both services have their base URL hard-coded. There is no Angular `environment.ts` — a deployment to a different host requires editing these two files directly.

### 7.5 Global styling — [client/src/styles.scss](client/src/styles.scss)

A single `:root` block owns the entire visual system — dark monochrome (black/white) with green success / red error / yellow warning accents:

```scss
:root {
  --bg-primary:  #050505;
  --bg-surface:  rgba(18, 18, 18, 0.75);   /* glass panels */
  --bg-surface-hover: #1c1c1c;
  --bg-elevated: #161616;

  --text-primary:   #f5f5f5;
  --text-secondary: #a0a0a0;
  --text-muted:     #5a5a5a;

  --accent:         #ffffff;
  --accent-light:   rgba(255, 255, 255, 0.08);
  --accent-glow:    0 0 20px rgba(255, 255, 255, 0.1);

  --success: #4ade80;   --error: #f87171;   --warning: #fbbf24;

  --radius: 12px;   --radius-lg: 16px;   --radius-pill: 999px;
  --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
```

- **Fonts** — `Inter` for body text, `Outfit` for headings and buttons. Both loaded from Google Fonts in `index.html`.
- **Icons** — Material Symbols Rounded (variable font, axes `FILL`, `wght`, `GRAD`, `opsz`). Active nav icons switch to `FILL 1` for a filled look.
- **Glass cards** — `.card` / `.glass-card` apply `backdrop-filter: blur(20px)` with a translucent surface and a 1 px white-alpha border.

### 7.6 Components

#### Landing — [client/src/app/components/landing/landing.ts](client/src/app/components/landing/landing.ts)

Marketing-style public page. Declares static `features[]` (6 cards, each with a Material icon) and `stats[]` (`< 30s`, `10+`, `99.9%`). **Note:** The copy refers to the segmentation model as **"UniverSeg"**, whereas the actual backend/ML service ships MedSAM. See §11.

#### Login — [client/src/app/components/login/login.ts](client/src/app/components/login/login.ts)

Template-driven form with two fields (`email`, `password`). On submit, calls `auth.login(...)`; on success, navigates to `/dashboard`. If the user is already logged in at construction time, it redirects to `/dashboard` immediately.

#### Register — [client/src/app/components/register/register.ts](client/src/app/components/register/register.ts)

Template-driven form: `name`, `email`, `password`, `hospital`, `specialization`. On success the backend auto-logs the user in (token + user are persisted by `AuthService.register`) and the component routes to `/dashboard`.

#### Dashboard — [client/src/app/components/dashboard/dashboard.ts](client/src/app/components/dashboard/dashboard.ts)

On init, fetches all of the user's cases and slices `cases.slice(0, 5)` as `recentCases`. Computed getters:

```ts
get totalCases()      { return this.cases.length; }
get completedCases()  { return this.cases.filter(c => c.status === 'completed').length; }
get processingCases() { return this.cases.filter(c => c.status === 'processing').length; }
```

#### New Case — [client/src/app/components/new-case/new-case.ts](client/src/app/components/new-case/new-case.ts) + [.html](client/src/app/components/new-case/new-case.html)

A three-step wizard driven by a local `step: 1 | 2 | 3` field:

- **Step 1 — Patient Information** (`*ngIf="step === 1"`): a two-column grid of fields (patient name, patient ID, age with `min=0 max=150`, gender/modality `<select>`s, body part, study date `<input type="date">`) and a full-width `<textarea>` for clinical notes. On submit calls `createCase`, stores the returned `caseId`, advances to step 2.
- **Step 2 — Upload Images**: a primary drop-zone for target images (required, multiple, `accept=".png,.jpg,.jpeg"`) and two secondary drop-zones for the optional support set (images + labels). Drag-and-drop is wired via `onDragOver` / `onDrop(event, 'images' | 'supportImages' | 'supportLabels')`. The **Upload & Run Segmentation** button kicks a two-step RxJS chain: `uploadFiles(...)` → on success → `runSegmentation(...)` → on success, advance to step 3 and then `router.navigate(['/case', caseId])` after a 1 s delay.
- **Step 3 — Processing**: centered spinner + copy. **There is no polling** — the spinner is shown only while the HTTP request is in flight; when Flask returns, the user is redirected to the viewer.

A progress indicator at the top shows the three steps with connecting lines and a check-mark once a step is completed.

#### Case Viewer — [client/src/app/components/case-viewer/case-viewer.ts](client/src/app/components/case-viewer/case-viewer.ts) + [.html](client/src/app/components/case-viewer/case-viewer.html)

Loads the case by `id` from the route params on init. Layout:

- **Header** — patient name, `modality · bodyPart · ID`, a status badge (classes `.badge-success` / `.badge-processing` / `.badge-error` / `.badge-created`), and a Delete button.
- **Main panel** — overlay image viewer. The original image renders first; the mask is rendered over it as a second `<img>` whose `opacity` is bound to the `maskOpacity` field (a `<input type="range" min="0" max="1" step="0.05">`). A **Show/Hide Mask** toggle flips `showMask`.
- **Thumbnail strip** — shown only if the case has more than one image; clicking a thumbnail updates `selectedImageIndex`.
- **Sidebar** — patient details (name, ID, age, gender, modality, body part, study date, clinical notes if any) plus a **Files** block (# of images, # of masks, creation timestamp).

The key helper is `getImageUrl(path: string)`, which rewrites absolute filesystem paths stored in Mongo to URLs under the Express static mount:

```ts
const uploadsIdx = path.indexOf('/uploads/');
if (uploadsIdx !== -1) return this.apiBase + path.substring(uploadsIdx);   // -> http://localhost:5002/uploads/...
return this.apiBase + '/uploads/' + path;
```

#### History — [client/src/app/components/history/history.ts](client/src/app/components/history/history.ts)

Simple list of all user cases (the full list, not just the first 5). Each row links to `/case/:id`. The inline Delete button prompts `confirm(...)` and removes the row client-side on success. No filters, sorting, or pagination in the current implementation.

#### Profile — [client/src/app/components/profile/profile.ts](client/src/app/components/profile/profile.ts)

Prefilled form (name / hospital / specialization) pulled from `auth.currentUser` on init. Email is shown read-only. `onSave()` calls `auth.updateProfile(this.form)` and sets `success` or `error` messages.

---

## 8. End-to-End Data Flow

A complete "register → segment → view" trip:

```
1. Angular  POST /api/auth/register
   Express  ← 201 { token, user }
            localStorage.setItem('token', ...)

2. Angular  POST /api/cases  { patientDetails: { ... } }
   Express  ← 201 { case }                     status = 'created'

3. Angular  POST /api/cases/:id/upload         (multipart: images[], supportImages[], supportLabels[])
   Express  writes to uploads/raw/<caseId>/ (and /support_sets/<caseId>/ for support files)
            ← 200 { case }                     status = 'uploading'

4. Angular  POST /api/cases/:id/segment
   Express  mkdir uploads/masks/<caseId>/
            status = 'processing'
            → axios POST http://localhost:5001/segment  { image_paths, support_image_paths, support_label_paths }

5. Flask    for each image:
              load_and_preprocess (→ 1024×1024×3 uint8)
              generate_bounding_box (Otsu → [x1,y1,x2,y2])
              predictor.set_image(img)                         [ViT-B encoder pass]
              predictor.predict(box=bbox, multimask_output=False)  [prompt + decoder pass]
              save_mask(mask, uploads/masks/<caseId>/mask_<name>.png, original_size)
            ← 200 { mask_paths, count }

   Express  segmentedImages = mask_paths      status = 'completed'
            ← 200 { case }

6. Angular  navigate(['/case', caseId])
            GET /api/cases/:id
            renders <img src="http://localhost:5002/uploads/raw/<caseId>/<name>.png">
            overlays <img src="http://localhost:5002/uploads/masks/<caseId>/mask_<name>.png"
                        style="opacity: {{ maskOpacity }}">
```

---

## 9. Complete API Reference

### Backend — Express (port 5002)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | — | `{ status: 'ok', timestamp }` |
| `POST` | `/api/auth/register` | — | `{ name, email, password, hospital, specialization }` → `{ token, user }` |
| `POST` | `/api/auth/login` | — | `{ email, password }` → `{ token, user }` |
| `GET` | `/api/auth/profile` | Bearer | `{ user }` |
| `PUT` | `/api/auth/profile` | Bearer | `{ name?, hospital?, specialization? }` → `{ user }` |
| `POST` | `/api/cases` | Bearer | `{ patientDetails }` → `{ case }`, status `'created'` |
| `POST` | `/api/cases/:caseId/upload` | Bearer | multipart `images[]`, `supportImages[]`, `supportLabels[]` (≤20 each, ≤50 MB each) → `{ case }`, status `'uploading'` |
| `POST` | `/api/cases/:caseId/segment` | Bearer | empty body; triggers Flask → `{ case }`, status `'completed'` or `'error'` |
| `GET` | `/api/cases` | Bearer | `{ cases: [...] }` (owned by user, newest first) |
| `GET` | `/api/cases/:caseId` | Bearer | `{ case }` |
| `DELETE` | `/api/cases/:caseId` | Bearer | removes document + on-disk files → `{ message }` |
| `GET` | `/uploads/*` | — | static file serving for images and masks |

### ML Service — Flask (port 5001, backend-only)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | `{ status: 'ok', model_loaded }` |
| `POST` | `/segment` | `{ image_paths, support_image_paths, support_label_paths }` → `{ mask_paths, count }` |

---

## 10. Setup & Running

### First-time setup

```bash
# Root: installs concurrently
npm install

# Backend
cd backend && npm install

# Frontend
cd client && npm install

# ML service — creates a venv, installs PyTorch + segment-anything,
# and downloads the ~350 MB MedSAM checkpoint from HuggingFace
cd ml_service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python download_model.py
```

Create `backend/.env` with the variables listed in §4.8.

### Running all three tiers

From the repo root (uses `concurrently`):

```bash
npm run start
```

### Running individually

```bash
# Backend (port 5002)
cd backend && npm run start

# ML service (port 5001) — venv must be active
cd ml_service && source venv/bin/activate && python app.py

# Frontend (port 4200)
cd client && npm run start
```

MongoDB must be reachable at `MONGODB_URI` before the backend starts.

---

## 11. Known Notes & Inconsistencies

- **Model naming discrepancy** — the landing page ([landing.ts](client/src/app/components/landing/landing.ts)) and the new-case processing copy ([new-case.html:135, 173](client/src/app/components/new-case/new-case.html)) describe the segmentation engine as **"UniverSeg"**, but the service actually runs **MedSAM (SAM ViT-B)** ([inference.py](ml_service/inference.py), [CLAUDE.md](CLAUDE.md)). The UI copy is aspirational rather than reflecting the shipped model.
- **Support set is accepted but unused** — `supportImages` and `supportLabels` are uploaded, stored, and passed through to Flask, but `run_inference` explicitly ignores them. The comment in [inference.py](ml_service/inference.py) states: *"MedSAM is a zero-shot promptable model, not a few-shot model."* These fields are scaffolding for a future UniverSeg-style few-shot path.
- **Bounding-box prompt is automatic** — the user never draws a box. The 1024×1024 image is Otsu-thresholded and the largest contour becomes the SAM prompt ([utils.py `generate_bounding_box`](ml_service/utils.py)). This works well on high-contrast scans (CT / X-Ray) and can fall back to a 90 % inset on low-contrast inputs.
- **Single output mask per image** — `multimask_output=False` in `predictor.predict(...)`, so SAM's usual three-candidate disambiguation is skipped; the decoder's best mask is used directly.
- **Hard-coded API URLs** — both Angular services point to `http://localhost:5002` directly; there is no Angular environment file. Any non-local deployment requires editing [services/auth.ts](client/src/app/services/auth.ts) and [services/case.ts](client/src/app/services/case.ts).
- **Shared filesystem coupling** — the backend and the ML service must be able to read/write the same `uploads/` path. The backend stores **absolute** paths in Mongo, and the frontend rewrites them to `/uploads/...` URLs on the fly ([case-viewer.ts `getImageUrl`](client/src/app/components/case-viewer/case-viewer.ts)). Running the two services on different machines would require a shared volume or an object-store migration.
- **No polling on the client** — `POST /api/cases/:id/segment` is synchronous from the browser's perspective and blocks up to the backend's 120 s axios timeout. The UI shows a spinner for the duration and redirects to the viewer when the call returns.
- **Test coverage** — no backend tests. Angular has Karma/Jasmine configured but the suite is minimal. The ML service has `ml_service/test_data/` with sample images for manual smoke tests.
- **`BCDU-Net/`** — archived research code; not wired into the running application.
