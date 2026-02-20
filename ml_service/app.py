"""
Flask ML Microservice for MedSAM segmentation.
Model is loaded once at startup.
"""

import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from inference import get_model, run_inference

app = Flask(__name__)
CORS(app)

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'uploads'))


@app.before_request
def ensure_model_loaded():
    """Ensure the MedSAM model is loaded before the first request."""
    get_model()


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model_loaded': True})


@app.route('/segment', methods=['POST'])
def segment():
    """
    Expects JSON body:
    {
        "image_paths": ["/abs/path/to/image1.png", ...],
        "support_image_paths": ["/abs/path/to/support1.png", ...],
        "support_label_paths": ["/abs/path/to/label1.png", ...]
    }

    Returns:
    {
        "mask_paths": ["/abs/path/to/mask_0000.png", ...],
        "count": 3
    }
    """
    try:
        data = request.get_json()

        if not data or 'image_paths' not in data:
            return jsonify({'error': 'image_paths is required'}), 400

        image_paths = data['image_paths']
        support_image_paths = data.get('support_image_paths', [])
        support_label_paths = data.get('support_label_paths', [])

        # Validate all paths exist
        for p in image_paths:
            if not os.path.isfile(p):
                return jsonify({'error': f'Image not found: {p}'}), 400
        for p in support_image_paths + support_label_paths:
            if not os.path.isfile(p):
                return jsonify({'error': f'Support file not found: {p}'}), 400

        # Determine output directory from first image path
        # e.g., /uploads/raw/<caseId>/image.png -> /uploads/masks/<caseId>/
        first_img = image_paths[0]
        case_dir = os.path.basename(os.path.dirname(first_img))
        output_dir = os.path.join(UPLOAD_DIR, 'masks', case_dir)

        mask_paths = run_inference(
            image_paths,
            support_image_paths,
            support_label_paths,
            output_dir,
        )

        return jsonify({
            'mask_paths': mask_paths,
            'count': len(mask_paths),
        })

    except Exception as e:
        print(f"[ERROR] Segmentation failed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("[INFO] Starting Flask ML service on port 5001...")
    print("[INFO] Pre-loading MedSAM model...")
    get_model()  # Load model at startup
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
