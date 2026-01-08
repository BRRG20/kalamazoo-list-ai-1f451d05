import JSZip from 'jszip';

/**
 * Downloads an image at full quality without any compression or resizing.
 * Fetches the original image data and triggers a browser download.
 */
export async function downloadImage(imageUrl: string, filename?: string): Promise<void> {
  try {
    // Fetch the original image as a blob (no compression, no resizing)
    const response = await fetch(imageUrl, {
      mode: 'cors',
      cache: 'no-cache',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const blob = await response.blob();
    
    // Create object URL for the blob
    const blobUrl = URL.createObjectURL(blob);
    
    // Determine filename from URL or use provided filename
    let downloadFilename = filename;
    if (!downloadFilename) {
      try {
        const urlPath = new URL(imageUrl).pathname;
        downloadFilename = urlPath.split('/').pop() || 'image';
      } catch {
        downloadFilename = 'image';
      }
    }
    
    // Ensure proper extension based on content type
    const contentType = blob.type;
    if (!downloadFilename.includes('.')) {
      if (contentType.includes('png')) {
        downloadFilename += '.png';
      } else if (contentType.includes('webp')) {
        downloadFilename += '.webp';
      } else {
        downloadFilename += '.jpg';
      }
    }
    
    // Create temporary anchor and trigger download
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = downloadFilename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
}

/**
 * Downloads all images as a zip file at full quality.
 * @param imageUrls Array of image URLs to download
 * @param zipFilename Name for the zip file (without extension)
 * @param onProgress Optional callback for progress updates (0-100)
 */
export async function downloadAllAsZip(
  imageUrls: string[],
  zipFilename: string = 'images',
  onProgress?: (progress: number) => void
): Promise<void> {
  if (imageUrls.length === 0) {
    throw new Error('No images to download');
  }

  const zip = new JSZip();
  let completed = 0;

  // Fetch all images in parallel
  const fetchPromises = imageUrls.map(async (url, index) => {
    try {
      const response = await fetch(url, {
        mode: 'cors',
        cache: 'no-cache',
      });

      if (!response.ok) {
        console.warn(`Failed to fetch image ${index + 1}: ${response.status}`);
        return null;
      }

      const blob = await response.blob();
      
      // Determine extension from content type
      let extension = '.jpg';
      const contentType = blob.type;
      if (contentType.includes('png')) {
        extension = '.png';
      } else if (contentType.includes('webp')) {
        extension = '.webp';
      }

      // Add to zip with sequential naming
      const filename = `image-${String(index + 1).padStart(2, '0')}${extension}`;
      zip.file(filename, blob);

      completed++;
      if (onProgress) {
        onProgress(Math.round((completed / imageUrls.length) * 80)); // 80% for fetching
      }

      return { filename, blob };
    } catch (error) {
      console.warn(`Error fetching image ${index + 1}:`, error);
      completed++;
      if (onProgress) {
        onProgress(Math.round((completed / imageUrls.length) * 80));
      }
      return null;
    }
  });

  await Promise.all(fetchPromises);

  // Generate zip file
  if (onProgress) onProgress(85);
  
  const zipBlob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'STORE' // No compression to preserve full quality
  });

  if (onProgress) onProgress(95);

  // Trigger download
  const blobUrl = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${zipFilename}.zip`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);

  if (onProgress) onProgress(100);
}
