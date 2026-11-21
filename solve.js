// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// Same answers bit-for-bit; much faster: indexOf-driven field scans and
// slice-built fields instead of one-character-at-a-time concatenation.
//
// Semantics (from vendor/csv-reader/index.js):
//  - U+FEFF at the very start is dropped.
//  - A record ends at LF or CRLF; a line with no characters is no record.
//  - Outside quotes a CR not followed by LF is dropped (stray_cr).
//  - A field opening with a quote runs to the next non-doubled quote ("" -> one
//    quote; CRLF/lone CR inside -> LF); text after the closing quote up to the
//    next comma/line-break is appended as-is (quote_junk when the field ends).
//  - A quote that never closes is a literal char and the text after it is
//    re-read as unquoted (unterminated_quote).
//  - A quote inside an unquoted field is literal; fields stay strings.
//  - columns = first record when header, else null; rows padded with ""
//    (short_row, fields: count) or cut (long_row, extra: cut fields) to the
//    first record's width. Errors {code, line, row} in order met; line is the
//    1-based line the record starts on, row its index in rows (null: header).
//
// Speed notes: the unquoted scan is inlined (no per-field call or result
// object), and the next-LF / next-CR positions are cached while they stay
// ahead of the read position: inside one record they are the same line end
// for every field, so most fields pay for one indexOf (the comma) only.

/** How a field ended. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const len = text.length;

  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // Cached index of the next LF / CR at or after the read position, -1 when
  // there is none left, -2 when not computed yet. A cached index stays the
  // first one at or after a later position while it is still ahead of it.
  let nCache = -2;
  let rCache = -2;

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      let value = '';
      let junk = false;
      let needScan = true;
      if (quoted) {
        const open = pos;
        const openLine = line;
        pos += 1;
        let closeIdx = -1;
        let doubled = false;
        let cur = pos;
        for (;;) {
          const q = text.indexOf('"', cur);
          if (q === -1) break;
          if (q + 1 < len && text.charCodeAt(q + 1) === 34) {
            doubled = true;
            cur = q + 2;
            continue;
          }
          closeIdx = q;
          break;
        }
        if (closeIdx === -1) {
          // The quote never closes: literal char, text after it re-read
          // as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          value = '"';
        } else {
          const start = pos;
          const ni = text.indexOf('\n', start);
          const ri = text.indexOf('\r', start);
          if (!doubled && !(ni !== -1 && ni < closeIdx) && !(ri !== -1 && ri < closeIdx)) {
            value = text.slice(start, closeIdx);
          } else {
            // Content holds doubled quotes and/or line breaks: build it by
            // slicing the plain runs between specials (a doubled quote or a
            // CR) instead of concatenating one character at a time; LFs are
            // copied as they stand and only counted.
            let v = '';
            let seg = start;
            let p = start;
            while (p < closeIdx) {
              const ch = text.charCodeAt(p);
              if (ch === 34) {
                v += text.slice(seg, p);
                v += '"';
                p += 2;
                seg = p;
              } else if (ch === 13) {
                v += text.slice(seg, p);
                v += '\n';
                line += 1;
                p += p + 1 < closeIdx && text.charCodeAt(p + 1) === 10 ? 2 : 1;
                seg = p;
              } else {
                if (ch === 10) line += 1;
                p += 1;
              }
            }
            value = v + text.slice(seg, closeIdx);
            nCache = -2;
            rCache = -2;
          }
          pos = closeIdx + 1;
          if (pos >= len) {
            ended = END;
            needScan = false;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos += 1;
              ended = COMMA;
              needScan = false;
            } else if (c === 10) {
              pos += 1;
              line += 1;
              ended = LINE_BREAK;
              needScan = false;
            } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line += 1;
              ended = LINE_BREAK;
              needScan = false;
            } else {
              // Text after the closing quote, appended as it stands.
              junk = true;
            }
          }
        }
      }
      if (needScan) {
        // Unquoted read onto `value`, up to the next comma or line break.
        // A CR not followed by LF is dropped (stray_cr).
        let added = 0;
        scan: for (;;) {
          const cIdx = text.indexOf(',', pos);
          if (nCache === -2 || (nCache !== -1 && nCache < pos)) nCache = text.indexOf('\n', pos);
          if (rCache === -2 || (rCache !== -1 && rCache < pos)) rCache = text.indexOf('\r', pos);
          const nIdx = nCache;
          const rIdx = rCache;
          let end;
          let eol;
          if (cIdx !== -1 && (nIdx === -1 || cIdx < nIdx)) {
            end = cIdx;
            eol = COMMA;
          } else if (nIdx !== -1) {
            end = nIdx;
            eol = LINE_BREAK;
          } else {
            end = len;
            eol = END;
          }
          if (rIdx !== -1 && rIdx < end) {
            if (eol === LINE_BREAK && rIdx === end - 1) {
              // CRLF: the CR is part of the line break, not the field.
              if (rIdx > pos) {
                value += text.slice(pos, rIdx);
                added += rIdx - pos;
              }
              pos = end + 1;
              line += 1;
              ended = LINE_BREAK;
              break scan;
            }
            // Stray CR: dropped, with an error; the field goes on after it.
            if (rIdx > pos) {
              value += text.slice(pos, rIdx);
              added += rIdx - pos;
            }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            pos = rIdx + 1;
            rCache = -2;
            continue scan;
          }
          if (end > pos) {
            value += text.slice(pos, end);
            added += end - pos;
          }
          if (eol === COMMA) {
            pos = end + 1;
            ended = COMMA;
          } else if (eol === LINE_BREAK) {
            pos = end + 1;
            line += 1;
            ended = LINE_BREAK;
          } else {
            pos = end;
            ended = END;
          }
          break scan;
        }
        if (junk && added > 0) {
          errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        }
      }
      fields.push(value);
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.slice(width) });
      fields.length = width;
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
