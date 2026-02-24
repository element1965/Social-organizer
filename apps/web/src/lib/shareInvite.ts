/**
 * Generate an OG image (white background, dark logo, "Social Organizer" text)
 * and share invite link with personalized text.
 */

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/** Load an image from URL and return it as HTMLImageElement */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Generate OG image as Blob: white bg, logo (fish left), "Social Organizer" */
async function generateOgImageBlob(): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = OG_WIDTH;
  canvas.height = OG_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

  // Draw logo-dark.png (fish looking left)
  try {
    const logo = await loadImage('/logo-dark.png');
    const logoHeight = 180;
    const logoWidth = logoHeight * (logo.width / logo.height);
    const logoX = (OG_WIDTH - logoWidth) / 2;
    const logoY = (OG_HEIGHT - logoHeight) / 2 - 60;
    ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
  } catch {
    // Fallback: just text
  }

  // "Social Organizer" text
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Social Organizer', OG_WIDTH / 2, OG_HEIGHT / 2 + 100);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

export interface ShareInviteOptions {
  url: string;
  userName: string;
  t: (key: string, opts?: Record<string, string>) => string;
}

/**
 * Share invite link with personalized message and OG image.
 * Falls back to clipboard copy if Web Share API is unavailable.
 */
export async function shareInviteLink({ url, userName, t }: ShareInviteOptions): Promise<'shared' | 'copied'> {
  const shareText = t('invite.shareText', { name: userName });

  // Try Web Share API with image
  if (navigator.share) {
    try {
      const blob = await generateOgImageBlob();
      const file = new File([blob], 'social-organizer-invite.png', { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'Social Organizer',
          text: shareText,
          url,
          files: [file],
        });
        return 'shared';
      }

      // Fallback: share without image
      await navigator.share({
        title: 'Social Organizer',
        text: shareText,
        url,
      });
      return 'shared';
    } catch (err: any) {
      // User cancelled or share failed — fall through to clipboard
      if (err?.name === 'AbortError') return 'shared';
    }
  }

  // Fallback: copy to clipboard
  await navigator.clipboard.writeText(`${shareText}\n${url}`);
  return 'copied';
}
