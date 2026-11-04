import { afterEach, describe, expect, it, vi } from 'vitest'
import { gatus } from '../src/lib/gatus'

afterEach(() => vi.unstubAllGlobals())

describe('gatus numbers', () => {
  const answer = (body: string) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))
  it('reads a bare number', async () => {
    answer('0.998\n')
    expect(await gatus.uptime('a', '24h')).toBe(0.998)
  })
  it('refuses an empty reply instead of reading it as 0', async () => {
    answer('')
    await expect(gatus.uptime('a', '24h')).rejects.toThrow()
    await expect(gatus.responseTime('a', '24h')).rejects.toThrow()
  })
})
