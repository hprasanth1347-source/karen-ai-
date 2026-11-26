export function success(res, data, status = 200) {
    return res.status(status).json({
        ok: true,
        data,
    });
}
export function error(res, message, status = 400, code) {
    return res.status(status).json({
        ok: false,
        error: message,
        code: code || 'ERROR',
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
    });
}
