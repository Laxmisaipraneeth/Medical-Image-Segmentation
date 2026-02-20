"""
Utility functions for MedSAM image preprocessing.
MedSAM expects 1024×1024 RGB images normalized to [0, 1].
"""

import numpy as np
from PIL import Image
import cv2


def load_and_preprocess(image_path, target_size=1024):
    """
    Load an image, convert to RGB, resize to target_size×target_size,
    and normalize pixel values to [0, 255] uint8 for SAM.
    Returns a numpy array of shape (H, W, 3).
    """
    img = Image.open(image_path).convert('RGB')
    img = img.resize((target_size, target_size), Image.BILINEAR)
    arr = np.array(img, dtype=np.uint8)  # (H, W, 3), range [0, 255]
    return arr


def generate_bounding_box(image_array, margin=20):
    """
    Auto-generate a bounding box around the region of interest.
    Uses Otsu thresholding on the grayscale image to detect foreground.
    Returns [x_min, y_min, x_max, y_max] in pixel coordinates.

    If no clear foreground is detected, returns the full image bounds
    with a small margin inward.
    """
    h, w = image_array.shape[:2]

    # Convert to grayscale
    if len(image_array.shape) == 3:
        gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY)
    else:
        gray = image_array.copy()

    # Apply Otsu thresholding
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Find contours
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if contours:
        # Get bounding box of the largest contour
        largest = max(contours, key=cv2.contourArea)
        x, y, bw, bh = cv2.boundingRect(largest)

        # Only use if the contour is reasonably sized (>5% of image area)
        if bw * bh > 0.05 * h * w:
            # Add margin
            x_min = max(0, x - margin)
            y_min = max(0, y - margin)
            x_max = min(w, x + bw + margin)
            y_max = min(h, y + bh + margin)
            return np.array([x_min, y_min, x_max, y_max])

    # Fallback: use whole image with slight margin inward
    m = min(h, w) // 10
    return np.array([m, m, w - m, h - m])


def save_mask(mask_array, output_path, original_size=None):
    """
    Save a 2D mask array as a PNG image.
    Optionally resize back to original_size.
    mask_array: shape (H, W) with values in [0, 1]
    """
    mask_uint8 = (mask_array * 255).astype(np.uint8)
    img = Image.fromarray(mask_uint8, mode='L')
    if original_size:
        img = img.resize(original_size, Image.NEAREST)
    img.save(output_path)
    return output_path


def get_original_size(image_path):
    """Return the (width, height) of the original image."""
    with Image.open(image_path) as img:
        return img.size
