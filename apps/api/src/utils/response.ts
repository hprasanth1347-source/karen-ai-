import { Response } from 'express';

export function success<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({
    ok: true,
    data,
  });
}

export function error(res: Response, message: string, status = 400, code?: string) {
  return res.status(status).json({
    ok: false,
    error: message,
    code: code || 'ERROR',
  });
}

export function paginated<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  limit: number
) {
  return res.status(200).json({
    ok: true,
    data: items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}
