# MedSAM Flask ML Service

This is the machine learning microservice for the MedSeg application. It provides an endpoint to perform medical image segmentation using the pre-trained MedSAM (Medical Segment Anything Model).

## Prerequisites

- Python 3.8+
- [MedSAM pre-trained weights](https://huggingface.co/SansuiHan/medical_models/resolve/main/medsam_vit_b.pth)

## Local Setup

Follow these steps to set up and run the service locally:

### 1. Create a Virtual Environment

Navigate to the `ml_service` directory and create a Python virtual environment:

```bash
cd ml_service
python3 -m venv venv
```

### 2. Activate the Virtual Environment

Activate the generated environment:

- **Mac/Linux:**
  ```bash
  source venv/bin/activate
  ```
- **Windows:**
  ```bash
  venv\Scripts\activate
  ```

### 3. Install Dependencies

Install all the required Python packages mentioned in `requirements.txt`:

```bash
pip install -r requirements.txt
```

#### 📍 Windows Users without a GPU (CPU-Only)

If you are running this on a Windows machine without an NVIDIA GPU, PyTorch will sometimes try to install with CUDA support which may bloat the install size or cause issues. It is recommended to install the CPU-only version of PyTorch _before_ running `pip install -r requirements.txt`. To do so, run this command:

```bash
pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

### 4. Download Pre-trained Weights

The application requires the MedSAM `vit_b` weights to be present in the `weights` directory. A helper script is provided to download them automatically:

```bash
python download_model.py
```

_Note: This will download a ~350MB `.pth` file from HuggingFace._

### 5. Run the Server

Start the Flask application:

```bash
python app.py
```

The service will start pre-loading the AI model into memory (this can take a few seconds and will use your Mac's MPS, a CUDA GPU if you have one, or fallback to your CPU). Once loaded, the server will listen on port **5001**.
