# MedSeg - AI Medical Segmentation Prototype

MedSeg is a full-stack prototype application designed for medical image segmentation. It uses an Angular frontend, an Express/MongoDB backend, and a Python Flask machine learning microservice powered by the **MedSAM** pre-trained AI model to intelligently segment uploaded medical images.

---

## 🛠️ Technology Stack

1. **Frontend**: Angular 21
2. **Backend**: Node.js, Express, MongoDB (Mongoose)
3. **ML Service**: Python 3.8+, Flask, PyTorch, MedSAM (Segment Anything Model for Medical Images)

---

## 💻 Cross-OS Setup Guide (Windows, Mac, Linux)

This guide provides instructions for setting up the entire project locally on your machine. You will need to run all three services concurrently.

### Prerequisites

Before you begin, ensure you have the following installed on your machine:

- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://www.python.org/downloads/) (v3.8+)
- [MongoDB](https://www.mongodb.com/try/download/community) (Running locally, or a MongoDB Atlas URI)
- [Git](https://git-scm.com/)

### 🚀 Quick Start (Using Concurrently)

This project has a top-level `package.json` setup that can install all dependencies and run all three services using a single command.

**Step 1:** Clone the repository

```bash
git clone https://github.com/Laxmisaipraneeth/Medical-Image-Segmentation.git
cd Medical-Image-Segmentation
```

**Step 2:** Setup Environment Variables
Navigate to the `backend` folder and create a `.env` file:

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/medseg # Or your MongoDB Atlas URI
JWT_SECRET=your_super_secret_key
```

**Step 3:** Setup Python Environment & Download Model Weights
Before using the quick start, you **must** configure the Python environment and download the AI model for the machine learning microservice.

Navigate to the `ml_service` folder and execute the following:

```bash
cd ml_service
python3 -m venv venv

# Activate the virtual environment
# --> For Mac/Linux:
source venv/bin/activate
# --> For Windows:
venv\Scripts\activate

# Install Dependencies
# 👉 *IMPORTANT FOR WINDOWS USERS WITHOUT A GPU*:
# Run this CPU-only PyTorch command BEFORE the requirements.txt command
# pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Run this for all OS to install remaining dependencies:
pip install -r requirements.txt

# Download MedSAM Weights (~350MB from HuggingFace)
python download_model.py

# Deactivate the environment and return to root
deactivate
cd ..
```

**Step 4:** Install Node Dependencies
From the root directory of the project, run:

```bash
# This will install the package that runs services concurrently
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..
```

**Step 5:** Start the entire application
From the root directory, run:

```bash
npm run start
```

This command will concurrently launch:

- Angular Frontend on `http://localhost:4200`
- Node Backend on `http://localhost:3000`
- Flask ML Server on `http://localhost:5001`

_(Note: The `npm run start` script automatically handles activating the python virtual environment for you.)_

---

## 🧩 Manual Step-by-Step Setup

If you prefer to run the services in separate terminal windows (recommended for debugging), follow these steps:

### 1. Backend Setup

```bash
cd backend
npm install
# Ensure your .env file is created (see Quick Start Step 2)
npm run start
# Or using nodemon: npx nodemon server.js
```

### 2. Machine Learning Service Setup

_Ensure you have completed the environment setup in Quick Start Step 3._

```bash
cd ml_service

# Activate environment
# Mac/Linux: source venv/bin/activate
# Windows: venv\Scripts\activate

python app.py
```

### 3. Frontend Setup

```bash
cd client
npm install
npm run start
```

---

## 🧠 Using the Application

1. Open your browser and navigate to `http://localhost:4200`.
2. Register for a new account or log in.
3. Navigate to the **"New Case"** section.
4. Upload a raw medical image.
5. Watch the Python ML service process the image and extract segmentation masks using MedSAM.
