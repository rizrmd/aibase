/**
 * Save visualization as PNG
 * For SVG elements (Mermaid): Direct SVG-to-PNG conversion to avoid oklch color issues
 * For other elements (Charts/Tables): html2canvas capture
 */

import html2canvas from 'html2canvas';

export interface SaveVisualizationOptions {
  element: HTMLElement;
  filename: string;
  convId: string;
  projectId: string;
}

export interface SavedImageResult {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: number;
}

/**
 * Convert SVG element to PNG base64 directly (bypasses html2canvas oklch issues)
 */
async function convertSvgToPng(svg: SVGElement, scale: number = 3): Promise<string> {
  // Clone the SVG to avoid modifying the original
  const clone = svg.cloneNode(true) as SVGElement;

  // Get dimensions from viewBox (most reliable for Mermaid SVGs)
  let width = 800;
  let height = 600;

  // Try to get dimensions from viewBox first (only available on SVGSVGElement)
  if (svg instanceof SVGSVGElement && svg.viewBox.baseVal) {
    const vb = svg.viewBox.baseVal;
    if (vb.width > 0) width = vb.width;
    if (vb.height > 0) height = vb.height;
  }

  // Fall back to getBoundingClientRect if viewBox is 0 or doesn't exist
  if (width === 800 && height === 600) {
    const bbox = svg.getBoundingClientRect();
    if (bbox.width > 0) width = bbox.width;
    if (bbox.height > 0) height = bbox.height;
  }

  // Ensure minimum dimensions
  width = Math.max(width, 400);
  height = Math.max(height, 300);

  console.log('[image-save] SVG dimensions:', { width, height, scale });

  // Set explicit dimensions on the clone
  clone.setAttribute('width', width.toString());
  clone.setAttribute('height', height.toString());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  // Serialize SVG to string
  const svgData = new XMLSerializer().serializeToString(clone);

  // Create a blob from the SVG data
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });

  // Create a URL for the blob
  const url = URL.createObjectURL(svgBlob);

  try {
    // Load the SVG into an Image
    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });

    // Create a canvas with the scaled dimensions
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d', {
      alpha: false, // No transparency needed
    });

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Scale and draw the image with high quality
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    console.log('[image-save] Canvas size:', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });

    // Convert to base64 with maximum quality
    return canvas.toDataURL('image/png', 1.0);
  } finally {
    // Clean up the object URL
    URL.revokeObjectURL(url);
  }
}

/**
 * Capture DOM element using html2canvas (for non-SVG content)
 */
async function captureWithHtml2Canvas(element: HTMLElement): Promise<string> {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    logging: false,
    useCORS: true,
    allowTaint: true,
    foreignObjectRendering: false,
  });

  return canvas.toDataURL('image/png');
}

/**
 * Capture DOM element and save as PNG to backend
 */
export async function saveVisualizationAsPNG(
  options: SaveVisualizationOptions
): Promise<SavedImageResult> {
  const { element, filename, convId, projectId } = options;

  try {
    console.log('[image-save] Capturing element:', {
      filename,
      elementClass: element.className,
      hasSvg: !!element.querySelector('svg'),
    });

    let base64: string;

    // Check if the element contains SVG (likely Mermaid)
    const svgElement = element.querySelector('svg');

    if (svgElement) {
      console.log('[image-save] Using direct SVG-to-PNG conversion');
      base64 = await convertSvgToPng(svgElement, 2);
    } else {
      console.log('[image-save] Using html2canvas');
      base64 = await captureWithHtml2Canvas(element);
    }

    console.log('[image-save] Canvas created, base64 length:', base64.length);
    console.log('[image-save] Sending to backend:', {
      filename,
      convId,
      projectId,
      base64Length: base64.length,
    });

    // Send to backend
    const response = await fetch(
      `/api/save-image?convId=${encodeURIComponent(convId)}&projectId=${encodeURIComponent(projectId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
          base64,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save image');
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to save image');
    }

    console.log('[image-save] Save successful:', result.file);
    return result.file;

  } catch (error) {
    console.error('Failed to save visualization:', error);
    throw error;
  }
}
