export function success(res, data, status = 200) {
    return res.status(status).json({
        ok: true,
        data,
        requestId: res.req?.requestId,
    });
}
export function error(res, message, status = 400, code, details) {
    return res.status(status).json({
        ok: false,
        error: message,
        code: code || 'INTERNAL_ERROR',
        ...(details ? { details } : {}),
        requestId: res.req?.requestId,
    });
}
export function paginated(res, items, total, page, limit) {
    return res.status(200).json({
        ok: true,
        data: items,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
        requestId: res.req?.requestId,
    });
}
