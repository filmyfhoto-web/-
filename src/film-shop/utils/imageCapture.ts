import html2canvas from 'html2canvas';

export const captureElementAsImage = async (element: HTMLElement): Promise<string> => {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2, // Higher quality
    useCORS: true,
    allowTaint: true,
    logging: false,
  });
  
  return canvas.toDataURL('image/jpeg', 0.9);
};

export const captureElementAsBlob = async (element: HTMLElement): Promise<Blob> => {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
  });
  
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob'));
      }
    }, 'image/jpeg', 0.9);
  });
};

export const downloadImage = (dataUrl: string, filename: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
