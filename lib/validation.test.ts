import { describe, it, expect } from 'vitest'
import {
  isValidEmail,
  sanitizeFilename,
  isAllowedMimeType,
  isAllowedFileSize,
  MAX_UPLOAD_BYTES,
} from './validation'

describe('isValidEmail', () => {
  it('accepte un email valide', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })
  it('accepte un email avec sous-domaine', () => {
    expect(isValidEmail('user@mail.example.co.uk')).toBe(true)
  })
  it('rejette une chaîne sans @', () => {
    expect(isValidEmail('notanemail')).toBe(false)
  })
  it('rejette une chaîne vide', () => {
    expect(isValidEmail('')).toBe(false)
  })
  it('rejette un email sans TLD', () => {
    expect(isValidEmail('user@domain')).toBe(false)
  })
  it('rejette un email avec espace', () => {
    expect(isValidEmail('user @example.com')).toBe(false)
  })
})

describe('sanitizeFilename', () => {
  it('remplace les slashes par underscore', () => {
    expect(sanitizeFilename('dir/file.pdf')).toBe('dir_file.pdf')
  })
  it('remplace les espaces par underscore', () => {
    expect(sanitizeFilename('mon document.pdf')).toBe('mon_document.pdf')
  })
  it('retire les caractères spéciaux dangereux', () => {
    // <, > et ? sont tous dans le pattern — 3 remplacements
    expect(sanitizeFilename('file<>?.pdf')).toBe('file___.pdf')
  })
  it('limite la longueur à 200 caractères', () => {
    const long = 'a'.repeat(300) + '.pdf'
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(200)
  })
  it('préserve les noms normaux intacts', () => {
    expect(sanitizeFilename('rapport-2026.pdf')).toBe('rapport-2026.pdf')
  })
})

describe('isAllowedMimeType', () => {
  it('accepte application/pdf', () => {
    expect(isAllowedMimeType('application/pdf')).toBe(true)
  })
  it('accepte image/png', () => {
    expect(isAllowedMimeType('image/png')).toBe(true)
  })
  it('rejette application/x-executable', () => {
    expect(isAllowedMimeType('application/x-executable')).toBe(false)
  })
  it('rejette text/html', () => {
    expect(isAllowedMimeType('text/html')).toBe(false)
  })
})

describe('isAllowedFileSize', () => {
  it('accepte un fichier de 1 octet', () => {
    expect(isAllowedFileSize(1)).toBe(true)
  })
  it('accepte un fichier de 10 Mo exactement', () => {
    expect(isAllowedFileSize(MAX_UPLOAD_BYTES)).toBe(true)
  })
  it('rejette un fichier de 10 Mo + 1 octet', () => {
    expect(isAllowedFileSize(MAX_UPLOAD_BYTES + 1)).toBe(false)
  })
  it('rejette 0 octet', () => {
    expect(isAllowedFileSize(0)).toBe(false)
  })
})
