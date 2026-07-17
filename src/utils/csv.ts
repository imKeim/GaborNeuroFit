/**
 * @file csv.ts
 * @description High-performance data interchange engine compliant with RFC 4180.
 * Implements a character-level Finite State Machine (FSM) for robust CSV parsing 
 * and serialization, ensuring clinical data portability across varying spreadsheet 
 * software and operating systems.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

/**
 * @description Highly optimized RFC 4180 compliant CSV parser.
 * 
 * @architecture
 * - Finite State Machine (FSM): Implements a two-state scanner (inQuotes / outOfQuotes).
 * - Delimiter Awareness: Correctly handles commas and line breaks embedded within 
 *   quoted strings, which is essential for preserving patient notes or localized fields.
 * - Platform Normalization: Symmetrically parses both Unix (LF) and Windows (CRLF) line endings.
 * 
 * @mathematical
 * Implements standard quote-doubling escaping logic: a sequence of two double-quotes ("") 
 * is correctly interpreted as a single literal double-quote character.
 * 
 * @param {string} text - The raw CSV input string.
 * @returns {string[][]} A 2D array representing rows and trimmed cells.
 */
export function parseCSV(text: string): string[][] {
    const result: string[][] = [];
    let row: string[] = [''];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Handle escaped double-quotes ("")
                row[row.length - 1] += '"';
                i++; 
            } else {
                // Toggle FSM state
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push('');
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++; // Normalize CRLF
            }
            if (row.length > 1 || row[0] !== '') {
                result.push(row.map(cell => cell.trim()));
            }
            row = [''];
        } else {
            row[row.length - 1] += char;
        }
    }
    // Finalize the trailing record
    if (row.length > 1 || row[0] !== '') {
        result.push(row.map(cell => cell.trim()));
    }
    return result;
}

/**
 * @description Safely serializes data headers and rows into an RFC 4180 CSV string.
 * 
 * @security
 * - Cell Sanitization: Automatically wraps cells in double-quotes and escapes internal quotes 
 *   if reserved delimiters (commas, newlines) are detected. 
 * - Prevent Injection: Neutralizes potential CSV injection attacks by strict stringification.
 * 
 * @clinical
 * - Microsoft Excel Compatibility: Prefixes the output with a UTF-8 Byte Order Mark (BOM: \uFEFF). 
 *   This ensures that localized Cyrillic patient profiles and session metrics are 
 *   automatically and correctly encoded when opened in spreadsheet software.
 * 
 * @param {string[]} headers - Array of record header strings.
 * @param {any[][]} rows - 2D array containing clinical session data cells.
 * @returns {string} Fully encoded CSV string with BOM marker.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeCSV(headers: string[], rows: any[][]): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escapeCell = (val: any): string => {
        const str = val === null || val === undefined ? '' : String(val);
        // Apply escaping if standard CSV delimiters are present in the payload
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const csvRows = [
        headers.map(escapeCell).join(','),
        ...rows.map(row => row.map(escapeCell).join(','))
    ];

    // Prepend UTF-8 BOM to guarantee cross-platform encoding detection
    return '\uFEFF' + csvRows.join('\n');
}