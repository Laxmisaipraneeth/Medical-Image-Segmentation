const axios = require('axios');

const FLASK_URL = process.env.FLASK_URL || 'http://localhost:5001';

/**
 * Send segmentation request to Flask ML service.
 * Uses shared filesystem — sends file paths, not binaries.
 */
const runSegmentation = async (imagePaths, supportImagePaths, supportLabelPaths) => {
  try {
    const response = await axios.post(
      `${FLASK_URL}/segment`,
      {
        image_paths: imagePaths,
        support_image_paths: supportImagePaths,
        support_label_paths: supportLabelPaths,
      },
      {
        timeout: 120000, // 2 min timeout for inference
        headers: { 'Content-Type': 'application/json' },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Flask service error:', error.message);
    if (error.response) {
      throw new Error(error.response.data.error || 'ML service returned an error');
    }
    throw new Error('ML service unavailable. Ensure Flask is running on port 5001.');
  }
};

module.exports = { runSegmentation };
