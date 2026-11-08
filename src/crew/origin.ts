import { NextRequest } from 'next/server';

/** The site address to put in emailed links. NEXT_PUBLIC_SITE_URL wins when set, so links never point at a preview. */
export function siteOrigin(req: NextRequest) {
  return (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
}
