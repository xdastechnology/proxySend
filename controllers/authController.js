// controllers/authController.js
const bcrypt = require('bcrypt');
const UserModel = require('../models/userModel');
const logger = require('../config/logger');

const SALT_ROUNDS = 12;

async function getLogin(req, res) {
  try {
    if (req.session && req.session.user) return res.redirect('/dashboard');
    res.render('auth/login', {
      title: 'Login - ProxySend',
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    logger.error(`getLogin error: ${err.message}`);
    res.redirect('/login?error=Something went wrong');
  }
}

async function getRegister(req, res) {
  try {
    if (req.session && req.session.user) return res.redirect('/dashboard');
    res.render('auth/register', {
      title: 'Register - ProxySend',
      error: req.query.error || null,
    });
  } catch (err) {
    logger.error(`getRegister error: ${err.message}`);
    res.redirect('/register?error=Something went wrong');
  }
}

async function postLogin(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render('auth/login', {
        title: 'Login - ProxySend',
        error: 'Email and password are required',
        success: null,
      });
    }

    const user = await UserModel.findByEmail(email.toLowerCase().trim());

    if (!user) {
      return res.render('auth/login', {
        title: 'Login - ProxySend',
        error: 'Invalid email or password',
        success: null,
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.render('auth/login', {
        title: 'Login - ProxySend',
        error: 'Invalid email or password',
        success: null,
      });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      credits: user.credits,
    };

    logger.info(`User logged in: ${user.email}`);
    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    return res.redirect(returnTo);
  } catch (err) {
    logger.error(`postLogin error: ${err.message}`);
    return res.render('auth/login', {
      title: 'Login - ProxySend',
      error: 'Login failed. Please try again.',
      success: null,
    });
  }
}

async function postRegister(req, res) {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.render('auth/register', {
        title: 'Register - ProxySend',
        error: 'All fields are required',
      });
    }

    if (password !== confirmPassword) {
      return res.render('auth/register', {
        title: 'Register - ProxySend',
        error: 'Passwords do not match',
      });
    }

    if (password.length < 8) {
      return res.render('auth/register', {
        title: 'Register - ProxySend',
        error: 'Password must be at least 8 characters',
      });
    }

    const existingUser = await UserModel.findByEmail(email.toLowerCase().trim());
    if (existingUser) {
      return res.render('auth/register', {
        title: 'Register - ProxySend',
        error: 'Email already registered',
      });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    await UserModel.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
    });

    logger.info(`New user registered: ${email}`);
    return res.redirect('/login?success=Account created successfully! Please login.');
  } catch (err) {
    logger.error(`postRegister error: ${err.message}`);
    return res.render('auth/register', {
      title: 'Register - ProxySend',
      error: 'Registration failed. Please try again.',
    });
  }
}

async function logout(req, res) {
  const userEmail = req.session.user?.email;
  req.session.destroy((err) => {
    if (err) logger.error(`Logout error: ${err.message}`);
    logger.info(`User logged out: ${userEmail}`);
    res.redirect('/login');
  });
}

module.exports = { getLogin, getRegister, postLogin, postRegister, logout };