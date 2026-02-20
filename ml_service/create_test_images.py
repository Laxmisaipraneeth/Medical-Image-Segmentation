
import numpy as np
from PIL import Image
import os

def create_dummy_data():
    os.makedirs('test_data', exist_ok=True)
    
    # Create a dummy "brain" image (noisy circle)
    img = np.zeros((128, 128), dtype=np.uint8)
    y, x = np.ogrid[:128, :128]
    mask = (x - 64)**2 + (y - 64)**2 <= 40**2
    img[mask] = 150
    img = img + np.random.randint(0, 50, (128, 128)).astype(np.uint8)
    Image.fromarray(img).save('test_data/target.png')
    Image.fromarray(img).save('test_data/support.png')
    
    # Create a dummy label (clean circle)
    lbl = np.zeros((128, 128), dtype=np.uint8)
    lbl[mask] = 255
    Image.fromarray(lbl).save('test_data/label.png')

    print("Created test_data/target.png, support.png, label.png")

if __name__ == '__main__':
    create_dummy_data()
