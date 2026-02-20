import os
import torch
import numpy as np
from PIL import Image
from segment_anything import sam_model_registry, SamPredictor
import utils

# Global model variables
sam_model = None
predictor = None
device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"

def get_model():
    global sam_model, predictor
    if predictor is None:
        model_path = os.path.join(os.path.dirname(__file__), 'weights', 'medsam_vit_b.pth')
        if not os.path.exists(model_path):
            from download_model import download_model
            model_path = download_model()
            
        print(f"[INFO] Loading MedSAM model from {model_path} to {device}...")
        
        sam_model = sam_model_registry["vit_b"](checkpoint=None)
        state_dict = torch.load(model_path, map_location=device, weights_only=True)
        sam_model.load_state_dict(state_dict)
        
        sam_model = sam_model.to(device)
        sam_model.eval()
        
        predictor = SamPredictor(sam_model)
        print("[INFO] Model loaded successfully.")
    return predictor

def run_inference(image_paths, support_image_paths, support_label_paths, output_dir):
    """
    Run MedSAM inference on a list of images.
    MedSAM uses bounding box prompts. The support images/labels are ignored 
    as MedSAM is a zero-shot promptable model, not a few-shot model.
    """
    pred = get_model()
    os.makedirs(output_dir, exist_ok=True)
    
    mask_paths = []
    
    for img_path in image_paths:
        # Load and preprocess to 1024x1024 RGB array
        img_np = utils.load_and_preprocess(img_path, target_size=1024)
        original_size = utils.get_original_size(img_path)
        
        # Generate bounding box on the 1024x1024 image
        bbox = utils.generate_bounding_box(img_np)
        
        # Run MedSAM Predictor
        pred.set_image(img_np)
        masks, iou_predictions, low_res_masks = pred.predict(
            box=bbox,
            multimask_output=False
        )
        
        # masks is a bool array of shape (1, H, W)
        mask_np = masks[0].astype(np.float32)
        
        out_name = f"mask_{os.path.basename(img_path)}"
        out_path = os.path.join(output_dir, out_name)
        
        utils.save_mask(mask_np, out_path, original_size=original_size)
        mask_paths.append(out_path)
        
    return mask_paths
