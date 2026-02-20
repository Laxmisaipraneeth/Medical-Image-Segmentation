"""
Download MedSAM pretrained weights (medsam_vit_b.pth).
Run this once before starting the Flask service.
"""

import os
import urllib.request
import sys

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'weights')
MODEL_PATH = os.path.join(MODEL_DIR, 'medsam_vit_b.pth')

# Official MedSAM checkpoint hosted on HuggingFace
MODEL_URL = 'https://huggingface.co/SansuiHan/medical_models/resolve/main/medsam_vit_b.pth'


def download_progress(count, block_size, total_size):
    """Simple progress bar for urllib."""
    pct = count * block_size * 100 // total_size
    downloaded_mb = count * block_size / (1024 * 1024)
    total_mb = total_size / (1024 * 1024)
    sys.stdout.write(f'\r[INFO] Downloading: {downloaded_mb:.1f}/{total_mb:.1f} MB ({pct}%)')
    sys.stdout.flush()


def download_model():
    """Download MedSAM checkpoint if not already present."""
    if os.path.isfile(MODEL_PATH):
        size_mb = os.path.getsize(MODEL_PATH) / (1024 * 1024)
        print(f'[INFO] MedSAM weights already exist: {MODEL_PATH} ({size_mb:.0f} MB)')
        return MODEL_PATH

    os.makedirs(MODEL_DIR, exist_ok=True)
    print(f'[INFO] Downloading MedSAM weights from HuggingFace...')
    print(f'[INFO] URL: {MODEL_URL}')
    print(f'[INFO] Saving to: {MODEL_PATH}')

    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH, reporthook=download_progress)
        print()  # newline after progress
        size_mb = os.path.getsize(MODEL_PATH) / (1024 * 1024)
        print(f'[INFO] Download complete! ({size_mb:.0f} MB)')
        return MODEL_PATH
    except Exception as e:
        # Clean up partial download
        if os.path.exists(MODEL_PATH):
            os.remove(MODEL_PATH)
        print(f'\n[ERROR] Download failed: {e}')
        print('[INFO] You can manually download from:')
        print(f'       {MODEL_URL}')
        print(f'       and place it at: {MODEL_PATH}')
        raise


if __name__ == '__main__':
    download_model()
