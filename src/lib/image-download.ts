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
