const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { User, UsageMetrics, Subscription } = require('./database');
const { generateToken, authMiddleware } = require('./auth');
const { TIER_CONFIG } = require('./tiers');

const router = express.Router();
const oauth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/google - Verify Google token and authenticate user
router.post('/auth/google', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'No token provided' });
    }

    // Verify the token with Google
    const ticket = await oauth2Client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Find or create user
    let user = await User.findOne({ where: { googleId } });

    if (!user) {
      // New user - create with auth-free tier
      user = await User.create({
        googleId,
        email,
        name,
        picture,
        tier: 'auth-free',
      });

      // Create usage metrics for new user
      await UsageMetrics.create({
        userId: user.id,
        generationsUsed: 0,
        generationsLimit: TIER_CONFIG['auth-free'].generationsLimit,
        currentJobCount: 0,
        maxJobCount: TIER_CONFIG['auth-free'].jobsPerSession,
      });

      // Create subscription record
      await Subscription.create({
        userId: user.id,
        tier: 'auth-free',
        status: 'active',
      });

      console.log(`✓ New user created: ${email}`);
    } else {
      // Update user info if changed
      if (user.name !== name || user.picture !== picture) {
        user.name = name;
        user.picture = picture;
        await user.save();
      }
    }

    // Generate JWT token
    const jwtToken = generateToken(user.id);

    res.json({
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        tier: user.tier,
      },
    });
  } catch (error) {
    console.error('❌ Google auth failed:', error.message);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// GET /api/auth/me - Get current user info
router.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      include: [
        {
          association: 'UsageMetrics',
          limit: 1,
          order: [['createdAt', 'DESC']],
        },
        {
          association: 'Subscriptions',
          limit: 1,
          order: [['createdAt', 'DESC']],
        },
      ],
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const usageMetrics = user.UsageMetrics && user.UsageMetrics[0];
    const subscription = user.Subscriptions && user.Subscriptions[0];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        tier: user.tier,
      },
      usage: usageMetrics ? {
        generationsUsed: usageMetrics.generationsUsed,
        generationsLimit: usageMetrics.generationsLimit,
        currentJobCount: usageMetrics.currentJobCount,
        maxJobCount: usageMetrics.maxJobCount,
      } : null,
      subscription: subscription ? {
        tier: subscription.tier,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      } : null,
    });
  } catch (error) {
    console.error('❌ Failed to fetch user:', error.message);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/auth/logout - Logout (optional, for frontend to clear token)
router.post('/auth/logout', authMiddleware, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
