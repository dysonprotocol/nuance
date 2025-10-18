import { vi } from 'vitest'

// Mock window.location for API baseURL
Object.defineProperty(window, 'location', {
  value: {
    origin: 'http://localhost:5173',
  },
  writable: true,
})

// Mock localStorage for VueUse storage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
})
