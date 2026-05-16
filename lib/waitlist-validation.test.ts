import { describe, it, expect } from 'vitest'
import { isValidSlug, isValidEmail } from './validation'

describe('isValidSlug', () => {
  it('accepte un slug simple', () => {
    expect(isValidSlug('my-venture')).toBe(true)
  })

  it('accepte des chiffres et tirets', () => {
    expect(isValidSlug('venture-2026-v2')).toBe(true)
  })

  it('rejette les majuscules', () => {
    expect(isValidSlug('MyVenture')).toBe(false)
  })

  it('rejette les espaces', () => {
    expect(isValidSlug('my venture')).toBe(false)
  })

  it('rejette les underscores', () => {
    expect(isValidSlug('my_venture')).toBe(false)
  })

  it('rejette une chaîne vide', () => {
    expect(isValidSlug('')).toBe(false)
  })

  it('rejette un slug trop long (>100 chars)', () => {
    expect(isValidSlug('a'.repeat(101))).toBe(false)
  })

  it('accepte un slug de 100 chars exactement', () => {
    expect(isValidSlug('a'.repeat(100))).toBe(true)
  })

  it('rejette les caractères spéciaux', () => {
    expect(isValidSlug('my/venture')).toBe(false)
    expect(isValidSlug('my?venture')).toBe(false)
    expect(isValidSlug('my#venture')).toBe(false)
  })
})

describe('isValidEmail (waitlist context)', () => {
  it('accepte un email classique', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })

  it('rejette un email sans domaine', () => {
    expect(isValidEmail('user@')).toBe(false)
  })

  it('rejette une chaîne sans @', () => {
    expect(isValidEmail('notanemail')).toBe(false)
  })
})
