export default function handler(_req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({
    ok: true,
    data: {
      service: 'karen-ultra-api',
      status: 'online',
      version: '1.0.0',
      timezone: 'Asia/Kolkata',
      timestamp: new Date().toISOString(),
    },
  });
}