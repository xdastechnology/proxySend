const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const { Readable } = require('stream');

const NAME_VARIANTS = ['name', 'full name', 'fullname', 'contact name', 'contactname'];
const PHONE_VARIANTS = ['phone', 'mobile', 'number', 'phone number', 'mobile number', 'contact', 'whatsapp'];
const EMAIL_VARIANTS = ['email', 'email address', 'emailaddress', 'mail'];
const GENDER_VARIANTS = ['gender', 'sex'];

function normalizeHeader(h) {
  return String(h).toLowerCase().trim().replace(/\s+/g, ' ');
}

function detectColumns(headers) {
  const normalized = headers.map(normalizeHeader);
  const find = (variants) => {
    for (const v of variants) {
      const idx = normalized.indexOf(v);
      if (idx !== -1) return idx;
    }
    // Partial match
    for (const v of variants) {
      const idx = normalized.findIndex((h) => h.includes(v));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  return {
    nameIdx: find(NAME_VARIANTS),
    phoneIdx: find(PHONE_VARIANTS),
    emailIdx: find(EMAIL_VARIANTS),
    genderIdx: find(GENDER_VARIANTS),
  };
}

function normalizeGender(raw) {
  if (!raw) return 'unspecified';
  const v = String(raw).toLowerCase().trim();
  if (v === 'm' || v === 'male') return 'male';
  if (v === 'f' || v === 'female') return 'female';
  if (v === 'o' || v === 'other') return 'other';
  return 'unspecified';
}

async function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const records = [];
    const stream = Readable.from(buffer);

    stream
      .pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
          bom: true,
        })
      )
      .on('data', (row) => records.push(row))
      .on('error', reject)
      .on('end', () => resolve(records));
  });
}

async function parseContactsCSV(buffer) {
  const records = await parseCSV(buffer);
  if (!records.length) return { contacts: [], columns: null };

  const headers = Object.keys(records[0]);
  const cols = detectColumns(headers);

  const contacts = records.map((row) => {
    const values = Object.values(row);
    return {
      name: cols.nameIdx >= 0 ? String(values[cols.nameIdx] || '').trim() : '',
      phone: cols.phoneIdx >= 0 ? String(values[cols.phoneIdx] || '').trim() : '',
      email: cols.emailIdx >= 0 ? String(values[cols.emailIdx] || '').trim() : '',
      gender: cols.genderIdx >= 0 ? normalizeGender(values[cols.genderIdx]) : 'unspecified',
    };
  });

  return { contacts, columns: cols };
}

function generateContactsCSV(contacts) {
  return new Promise((resolve, reject) => {
    const rows = contacts.map((c) => ({
      Name: c.name,
      Phone: c.phone,
      Email: c.email || '',
      Gender: c.gender || 'unspecified',
    }));

    stringify(rows, { header: true }, (err, output) => {
      if (err) return reject(err);
      // Add UTF-8 BOM
      resolve('\uFEFF' + output);
    });
  });
}

module.exports = { parseContactsCSV, generateContactsCSV };
