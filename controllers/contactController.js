const ContactModel = require('../models/contactModel');
const logger = require('../config/logger');
const fs = require('fs');
const csv = require('csv-parser');
const {
  normalizeIndianPhoneNumber,
  doesWhatsAppNumberExist,
} = require('../config/baileys');

function normalizeGender(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (raw === 'male' || raw === 'female' || raw === 'other') {
    return raw;
  }
  return 'unspecified';
}

function normalizeEmail(value) {
  const email = (value || '').toString().trim().toLowerCase();
  if (!email) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) ? email : null;
}

async function validateContactWhatsAppNumber(userId, rawPhone) {
  const normalizedPhone = normalizeIndianPhoneNumber(rawPhone);
  if (!normalizedPhone) {
    return { success: false, error: 'Invalid phone number format. Use a valid 10-digit Indian number.' };
  }

  const verification = await doesWhatsAppNumberExist(userId, normalizedPhone);
  if (!verification.success) {
    return { success: false, error: verification.error || 'Failed to verify number on WhatsApp' };
  }

  if (!verification.exists) {
    return { success: false, error: 'This phone number is not registered on WhatsApp' };
  }

  return { success: true, phone: verification.normalizedPhone };
}

function escapeCsvValue(value) {
  const str = value == null ? '' : String(value);
  if (/[,"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function renderContactsPage(req, res, { editContact = null } = {}) {
  const userId = req.session.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const { contacts = [], total = 0 } = (await ContactModel.findByUserId(userId, page, limit)) || {};
  const totalPages = Math.ceil(total / limit);

  res.render('contacts', {
    title: 'Contacts - ProxySend',
    contacts: Array.isArray(contacts) ? contacts : [],
    total,
    currentPage: page,
    totalPages,
    editContact,
    error: req.query.error || null,
    success: req.query.success || null,
  });
}

async function getContacts(req, res) {
  try {
    await renderContactsPage(req, res, { editContact: null });
  } catch (err) {
    logger.error(`getContacts error: ${err.message}`);
    res.redirect('/dashboard?error=Failed to load contacts');
  }
}

async function getEditContact(req, res) {
  try {
    const userId = req.session.user.id;
    const contactId = req.params.id;
    const editContact = await ContactModel.findById(contactId, userId);

    if (!editContact) {
      return res.redirect('/contacts?error=Contact not found');
    }

    await renderContactsPage(req, res, { editContact });
  } catch (err) {
    logger.error(`getEditContact error: ${err.message}`);
    res.redirect('/contacts?error=Failed to load contact for editing');
  }
}

async function addContact(req, res) {
  try {
    const userId = req.session.user.id;
    const { name, phone, email, gender } = req.body;

    if (!name || !phone) {
      return res.redirect('/contacts?error=Name and phone are required');
    }

    const phoneValidation = await validateContactWhatsAppNumber(userId, phone);
    if (!phoneValidation.success) {
      return res.redirect(`/contacts?error=${encodeURIComponent(phoneValidation.error)}`);
    }

    const cleanEmail = normalizeEmail(email);
    if ((email || '').trim() && !cleanEmail) {
      return res.redirect('/contacts?error=Invalid email format');
    }

    const cleanGender = normalizeGender(gender);

    const result = await ContactModel.create({
      userId,
      name: name.trim(),
      phone: phoneValidation.phone,
      email: cleanEmail,
      gender: cleanGender,
    });

    if (!result.success) {
      return res.redirect(`/contacts?error=${encodeURIComponent(result.error)}`);
    }

    logger.info(`Contact added by user ${userId}: ${phoneValidation.phone}`);
    res.redirect('/contacts?success=Contact added successfully');
  } catch (err) {
    logger.error(`addContact error: ${err.message}`);
    res.redirect('/contacts?error=Failed to add contact');
  }
}

async function deleteContact(req, res) {
  try {
    const userId = req.session.user.id;
    const contactId = req.params.id;

    const deleted = await ContactModel.delete(contactId, userId);

    if (!deleted) {
      return res.redirect('/contacts?error=Contact not found');
    }

    logger.info(`Contact ${contactId} deleted by user ${userId}`);
    res.redirect('/contacts?success=Contact deleted successfully');
  } catch (err) {
    logger.error(`deleteContact error: ${err.message}`);
    res.redirect('/contacts?error=Failed to delete contact');
  }
}

async function updateContact(req, res) {
  try {
    const userId = req.session.user.id;
    const contactId = req.params.id;
    const { name, phone, email, gender } = req.body;

    if (!name || !phone) {
      return res.redirect(`/contacts/edit/${contactId}?error=Name and phone are required`);
    }

    const existing = await ContactModel.findById(contactId, userId);
    if (!existing) {
      return res.redirect('/contacts?error=Contact not found');
    }

    const phoneValidation = await validateContactWhatsAppNumber(userId, phone);
    if (!phoneValidation.success) {
      return res.redirect(`/contacts/edit/${contactId}?error=${encodeURIComponent(phoneValidation.error)}`);
    }

    const cleanEmail = normalizeEmail(email);
    if ((email || '').trim() && !cleanEmail) {
      return res.redirect(`/contacts/edit/${contactId}?error=Invalid email format`);
    }

    const cleanGender = normalizeGender(gender);

    const result = await ContactModel.update(contactId, userId, {
      name: name.trim(),
      phone: phoneValidation.phone,
      email: cleanEmail,
      gender: cleanGender,
    });

    if (!result.success) {
      return res.redirect(`/contacts/edit/${contactId}?error=${encodeURIComponent(result.error)}`);
    }

    logger.info(`Contact ${contactId} updated by user ${userId}`);
    res.redirect('/contacts?success=Contact updated successfully');
  } catch (err) {
    logger.error(`updateContact error: ${err.message}`);
    res.redirect('/contacts?error=Failed to update contact');
  }
}

async function importContacts(req, res) {
  try {
    const userId = req.session.user.id;

    if (!req.file) {
      return res.redirect('/contacts?error=No file uploaded');
    }

    const contacts = [];
    const filePath = req.file.path;

    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          const name = (row.name || row.Name || '').trim();
          const phone = (row.phone || row.Phone || row.number || '').toString().trim();
          const email = normalizeEmail(row.email || row.Email || row.mail || '');
          const gender = normalizeGender(row.gender || row.Gender || '');

          if (name && phone) {
            contacts.push({ name, phone, email, gender });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    if (contacts.length === 0) {
      return res.redirect('/contacts?error=No valid contacts found in CSV');
    }

    const validContacts = [];
    const seenPhones = new Set();
    let invalidFormatCount = 0;
    let notOnWhatsAppCount = 0;
    let duplicateInFileCount = 0;

    for (const contact of contacts) {
      const phoneValidation = await validateContactWhatsAppNumber(userId, contact.phone);
      if (!phoneValidation.success) {
        if ((phoneValidation.error || '').toLowerCase().includes('not connected')) {
          return res.redirect('/contacts?error=WhatsApp is not connected. Connect WhatsApp before importing contacts');
        }
        if ((phoneValidation.error || '').toLowerCase().includes('not registered on whatsapp')) {
          notOnWhatsAppCount += 1;
        } else {
          invalidFormatCount += 1;
        }
        continue;
      }

      if (seenPhones.has(phoneValidation.phone)) {
        duplicateInFileCount += 1;
        continue;
      }
      seenPhones.add(phoneValidation.phone);

      validContacts.push({
        ...contact,
        phone: phoneValidation.phone,
      });
    }

    if (validContacts.length === 0) {
      return res.redirect('/contacts?error=No WhatsApp-valid contacts found in CSV');
    }

    const inserted = await ContactModel.bulkInsert(userId, validContacts);
    const duplicateInDatabaseCount = validContacts.length - inserted;

    logger.info(`${inserted} contacts imported by user ${userId}`);

    const summary = [
      `${inserted} contacts imported successfully`,
      invalidFormatCount > 0 ? `${invalidFormatCount} invalid` : null,
      notOnWhatsAppCount > 0 ? `${notOnWhatsAppCount} not on WhatsApp` : null,
      duplicateInFileCount > 0 ? `${duplicateInFileCount} duplicates in file` : null,
      duplicateInDatabaseCount > 0 ? `${duplicateInDatabaseCount} already existed` : null,
    ].filter(Boolean).join(', ');

    res.redirect(`/contacts?success=${encodeURIComponent(summary)}`);
  } catch (err) {
    logger.error(`importContacts error: ${err.message}`);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.redirect('/contacts?error=Failed to import contacts');
  }
}

async function exportContactsCsv(req, res) {
  try {
    const userId = req.session.user.id;
    const contacts = await ContactModel.findAllByUserId(userId);
    const safeContacts = Array.isArray(contacts) ? contacts : [];

    const header = ['name', 'phone', 'email', 'gender', 'created_at'];
    const rows = safeContacts.map((contact) => [
      escapeCsvValue(contact.name),
      escapeCsvValue(contact.phone),
      escapeCsvValue(contact.email || ''),
      escapeCsvValue(contact.gender || ''),
      escapeCsvValue(contact.created_at || ''),
    ].join(','));

    const csvContent = ['\uFEFF' + header.join(','), ...rows].join('\n');
    const fileName = `contacts_${userId}_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    logger.error(`exportContactsCsv error: ${err.message}`);
    return res.redirect('/contacts?error=Failed to export contacts');
  }
}

async function searchContacts(req, res) {
  try {
    const userId = req.session.user.id;
    const query = req.query.q || '';
    const contacts = await ContactModel.search(userId, query);
    res.json({ success: true, contacts });
  } catch (err) {
    logger.error(`searchContacts error: ${err.message}`);
    res.json({ success: false, error: 'Search failed' });
  }
}

module.exports = {
  getContacts,
  getEditContact,
  addContact,
  updateContact,
  deleteContact,
  importContacts,
  exportContactsCsv,
  searchContacts,
};