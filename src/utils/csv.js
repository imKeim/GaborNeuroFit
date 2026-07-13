/*
 * GaborNeuroFit - High-Performance RFC 4180 CSV Engine
 * Copyright (C) 2026 Pavel Korotkov
 */

/**
 * Highly optimized RFC 4180 compliant CSV parser (State Machine)
 * @param {string} text - The raw CSV input string
 * @returns {string[][]} A 2D array representing rows and cells
 */
export function parseCSV(text) {
    const result = [];
    let row = [''];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote "" -> append a single quote
                row[row.length - 1] += '"';
                i++; // Skip the second quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push('');
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++; // Handle CRLF
            }
            if (row.length > 1 || row[0] !== '') {
                result.push(row.map(cell => cell.trim()));
            }
            row = [''];
        } else {
            row[row.length - 1] += char;
        }
    }
    if (row.length > 1 || row[0] !== '') {
        result.push(row.map(cell => cell.trim()));
    }
    return result;
}

/**
 * Safely serializes headers and rows into a standardized RFC 4180 CSV string
 * @param {string[]} headers - Array of header strings
 * @param {any[][]} rows - 2D array of row cells
 * @returns {string} Fully encoded CSV string with BOM marker
 */
export function serializeCSV(headers, rows) {
    const escapeCell = (val) => {
        const str = val === null || val === undefined ? '' : String(val);
        // If the cell contains commas, quotes, or newlines, it must be escaped
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const csvRows = [
        headers.map(escapeCell).join(','),
        ...rows.map(row => row.map(escapeCell).join(','))
    ];

    return '\uFEFF' + csvRows.join('\n');
}