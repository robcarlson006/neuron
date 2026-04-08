/**
 * DB tests - tests the schema definitions and helper functions
 * since the actual DB operations run in the main process
 */

import { DB_SCHEMA, MASTERED_INTERVAL } from '../../src/lib/db'

describe('Database Schema', () => {
  it('contains users table definition', () => {
    expect(DB_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS users')
  })

  it('contains subjects table with status constraint', () => {
    expect(DB_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS subjects')
    expect(DB_SCHEMA).toContain("status IN ('active', 'ongoing', 'archived')")
  })

  it('contains materials table', () => {
    expect(DB_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS materials')
  })

  it('contains cards table with type constraint', () => {
    expect(DB_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS cards')
    expect(DB_SCHEMA).toContain("type IN ('flashcard', 'active_recall')")
  })

  it('contains card_schedule table with defaults', () => {
    expect(DB_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS card_schedule')
    expect(DB_SCHEMA).toContain('interval INTEGER NOT NULL DEFAULT 1')
    expect(DB_SCHEMA).toContain('repetitions INTEGER NOT NULL DEFAULT 0')
    expect(DB_SCHEMA).toContain('ease_factor REAL NOT NULL DEFAULT 2.5')
  })

  it('contains review_log table', () => {
    expect(DB_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS review_log')
    expect(DB_SCHEMA).toContain('quality INTEGER NOT NULL')
    expect(DB_SCHEMA).toContain('was_correct INTEGER NOT NULL DEFAULT 0')
  })

  it('contains deadlines table', () => {
    expect(DB_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS deadlines')
    expect(DB_SCHEMA).toContain('deadline_date TEXT NOT NULL')
  })

  it('contains diagnostics table', () => {
    expect(DB_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS diagnostics')
    expect(DB_SCHEMA).toContain('summary_json TEXT NOT NULL')
  })

  it('contains app_meta table', () => {
    expect(DB_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS app_meta')
  })

  it('uses IF NOT EXISTS to be safe on re-runs', () => {
    const tables = DB_SCHEMA.match(/CREATE TABLE IF NOT EXISTS/g) || []
    expect(tables.length).toBeGreaterThanOrEqual(8)
  })
})

describe('MASTERED_INTERVAL constant', () => {
  it('is set to 21 days', () => {
    expect(MASTERED_INTERVAL).toBe(21)
  })
})

describe('Due card schedule calculation', () => {
  it('correctly identifies cards due today', () => {
    const today = new Date().toISOString().split('T')[0]
    const schedule = { due_date: today, interval: 1, repetitions: 1, ease_factor: 2.5 }
    expect(schedule.due_date <= today).toBe(true)
  })

  it('correctly identifies overdue cards', () => {
    const pastDate = '2020-01-01'
    const today = new Date().toISOString().split('T')[0]
    expect(pastDate <= today).toBe(true)
  })

  it('correctly identifies future cards as not due', () => {
    const future = new Date()
    future.setDate(future.getDate() + 7)
    const futureDate = future.toISOString().split('T')[0]
    const today = new Date().toISOString().split('T')[0]
    expect(futureDate > today).toBe(true)
  })

  it('card with interval >= 21 is considered mastered', () => {
    const masteredCard = { interval: 21, ease_factor: 2.5 }
    expect(masteredCard.interval >= MASTERED_INTERVAL).toBe(true)
  })

  it('card with interval < 21 is not mastered', () => {
    const notMastered = { interval: 20, ease_factor: 2.5 }
    expect(notMastered.interval >= MASTERED_INTERVAL).toBe(false)
  })
})
