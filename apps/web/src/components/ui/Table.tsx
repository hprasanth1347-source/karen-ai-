import React from 'react'
import clsx from 'clsx'

interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => React.ReactNode
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyField: keyof T
  className?: string
  emptyMessage?: string
}

export function Table<T>({ columns, data, keyField, className, emptyMessage = 'No data' }: TableProps<T>) {
  return (
    <div className={clsx('border-2 border-ink overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-ink text-cream">
            {columns.map((col) => (
              <th key={String(col.key)} className={clsx('px-3 py-2 text-left font-bold uppercase tracking-wide', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-ink/50 font-semibold">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr key={String(row[keyField])} className="border-t-2 border-ink hover:bg-cream-200 transition-colors">
                {columns.map((col) => (
                  <td key={String(col.key)} className={clsx('px-3 py-2', col.className)}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[String(col.key)] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
