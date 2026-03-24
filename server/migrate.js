require('dotenv').config();
const { Sequelize } = require('sequelize');

async function addMissingColumns() {
  try {
    console.log('🔧 Adding missing columns to database...');
    
    const sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: false,
    });

    // Add the missing column
    await sequelize.query(`
      ALTER TABLE usage_metrics 
      ADD COLUMN IF NOT EXISTS "lastWarningEmailSent" TIMESTAMP DEFAULT NULL;
    `);

    await sequelize.query(`
      ALTER TABLE usage_metrics 
      ADD COLUMN IF NOT EXISTS "bonusGenerations" INTEGER DEFAULT 0;
    `);

    await sequelize.query(`
      ALTER TABLE usage_metrics 
      ADD COLUMN IF NOT EXISTS "bonusExpiresAt" TIMESTAMP DEFAULT NULL;
    `);
    
    console.log('✅ Column "lastWarningEmailSent" added successfully (or already exists)');
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  }
}

addMissingColumns();
