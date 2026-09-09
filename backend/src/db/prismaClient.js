'use strict';

/**
 * prismaClient.js
 *
 * Exports a single shared PrismaClient instance.
 *
 * WHY A SINGLETON?
 *   PrismaClient opens a connection pool. If every file did `new PrismaClient()`
 *   you'd open dozens of pools and hit Neon's connection limit fast.
 *   One shared instance = one pool shared across the whole app.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['warn', 'error']   // show warnings in dev, not every query (too noisy)
    : ['error'],
});

module.exports = prisma;
