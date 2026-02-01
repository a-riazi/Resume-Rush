const { Sequelize } = require('sequelize');
const path = require('path');

// Initialize Sequelize
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

// Define Models

// Users Model
const User = sequelize.define('User', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true,
  },
  email: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
    lowercase: true,
  },
  googleId: {
    type: Sequelize.STRING,
    unique: true,
    allowNull: true,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  picture: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  tier: {
    type: Sequelize.ENUM('free', 'auth-free', 'monthly', 'one-time'),
    defaultValue: 'free',
  },
  createdAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
  updatedAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
}, {
  tableName: 'users',
  timestamps: true,
});

// Anonymous Usage Tracking (by IP)
const AnonymousUsage = sequelize.define('AnonymousUsage', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true,
  },
  ipAddress: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  generationsUsed: {
    type: Sequelize.INTEGER,
    defaultValue: 0,
  },
  lastResetDate: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
  createdAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
  updatedAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
}, {
  tableName: 'anonymous_usage',
  timestamps: true,
  indexes: [
    {
      unique: false,
      fields: ['ipAddress'],
    },
  ],
});

// Subscriptions Model
const Subscription = sequelize.define('Subscription', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: Sequelize.UUID,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  stripeCustomerId: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  stripeSubscriptionId: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  tier: {
    type: Sequelize.ENUM('free', 'auth-free', 'monthly', 'one-time'),
    defaultValue: 'free',
  },
  status: {
    type: Sequelize.ENUM('active', 'paused', 'canceled', 'expired'),
    defaultValue: 'active',
  },
  currentPeriodStart: {
    type: Sequelize.DATE,
    allowNull: true,
  },
  currentPeriodEnd: {
    type: Sequelize.DATE,
    allowNull: true,
  },
  createdAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
  updatedAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
}, {
  tableName: 'subscriptions',
  timestamps: true,
});

// Usage Metrics Model
const UsageMetrics = sequelize.define('UsageMetrics', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: Sequelize.UUID,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  generationsUsed: {
    type: Sequelize.INTEGER,
    defaultValue: 0,
  },
  generationsLimit: {
    type: Sequelize.INTEGER,
    defaultValue: 3, // Free tier default
  },
  tailoringsUsed: {
    type: Sequelize.INTEGER,
    defaultValue: 0,
  },
  tailoringsLimit: {
    type: Sequelize.INTEGER,
    defaultValue: 1, // Free tier default (1 job at a time)
  },
  currentJobCount: {
    type: Sequelize.INTEGER,
    defaultValue: 0,
  },
  maxJobCount: {
    type: Sequelize.INTEGER,
    defaultValue: 1, // Free tier default
  },
  resetDate: {
    type: Sequelize.DATE,
    allowNull: true,
  },
  createdAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
  updatedAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
}, {
  tableName: 'usage_metrics',
  timestamps: true,
});

// Resumes Model
const Resume = sequelize.define('Resume', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: Sequelize.UUID,
    allowNull: true, // Allow null for anonymous users
    references: {
      model: User,
      key: 'id',
    },
  },
  originalData: {
    type: Sequelize.JSON,
    allowNull: false,
  },
  parsedData: {
    type: Sequelize.JSON,
    allowNull: false,
  },
  createdAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
  updatedAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
}, {
  tableName: 'resumes',
  timestamps: true,
});

// Tailorings Model
const Tailoring = sequelize.define('Tailoring', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: Sequelize.UUID,
    allowNull: true,
    references: {
      model: User,
      key: 'id',
    },
  },
  resumeId: {
    type: Sequelize.UUID,
    allowNull: false,
    references: {
      model: Resume,
      key: 'id',
    },
  },
  jobDescription: {
    type: Sequelize.TEXT,
    allowNull: false,
  },
  tailoredData: {
    type: Sequelize.JSON,
    allowNull: false,
  },
  createdAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
  updatedAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
}, {
  tableName: 'tailorings',
  timestamps: true,
});

// Define relationships
User.hasMany(Subscription, { foreignKey: 'userId', onDelete: 'CASCADE' });
Subscription.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(UsageMetrics, { foreignKey: 'userId', onDelete: 'CASCADE' });
UsageMetrics.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Resume, { foreignKey: 'userId', onDelete: 'CASCADE' });
Resume.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Tailoring, { foreignKey: 'userId', onDelete: 'CASCADE' });
Tailoring.belongsTo(User, { foreignKey: 'userId' });

Resume.hasMany(Tailoring, { foreignKey: 'resumeId', onDelete: 'CASCADE' });
Tailoring.belongsTo(Resume, { foreignKey: 'resumeId' });

// Initialize database
async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected');

    await sequelize.sync();
    console.log('✓ Database models synchronized');

    return { sequelize, User, Subscription, UsageMetrics, Resume, Tailoring, AnonymousUsage };
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    process.exit(1);
  }
}

module.exports = {
  initializeDatabase,
  sequelize,
  User,
  Subscription,
  UsageMetrics,
  Resume,
  Tailoring,
  AnonymousUsage,
};
