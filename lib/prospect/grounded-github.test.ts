import { describe, expect, it } from 'vitest'
import { findGroundedGithubProspect } from './grounded-github'

describe('findGroundedGithubProspect', () => {
  it('returns the first grounded GitHub prospect with a public business email', async () => {
    const responses = new Map<string, unknown>([
      [
        'https://api.github.com/search/users?q=agency+studio+in%3Abio+repos%3A%3E2+followers%3A%3E1&per_page=5',
        {
          items: [{ url: 'https://api.github.com/users/freshworkstudio' }],
        },
      ],
      [
        'https://api.github.com/users/freshworkstudio',
        {
          login: 'freshworkstudio',
          name: 'Freshwork Studio',
          email: 'gonzalo@freshworkstudio.com',
          company: null,
          bio: 'Web Development Agency',
          html_url: 'https://github.com/freshworkstudio',
          blog: 'https://freshworkstudio.com',
          followers: 12,
          public_repos: 8,
          hireable: true,
        },
      ],
    ])

    const result = await findGroundedGithubProspect({
      query: '300EUR diagnostic freelancers small agencies',
      fetchImpl: async (url) =>
        new Response(JSON.stringify(responses.get(url) ?? {}), {
          status: responses.has(url) ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        }),
    })

    expect(result).not.toBeNull()
    expect(result).toMatchObject({
      company_name: 'Freshwork Studio',
      source: 'other',
      contact_name: 'Freshwork Studio',
      contact_email: 'gonzalo@freshworkstudio.com',
      source_url: 'https://github.com/freshworkstudio',
      band: 'hot',
    })
    expect(result?.pain_points.length).toBeGreaterThan(0)
    expect(result?.outreach_subject.length).toBeGreaterThan(0)
  })

  it('ignores noreply and missing-email profiles', async () => {
    const responses = new Map<string, unknown>([
      [
        'https://api.github.com/search/users?q=agency+studio+in%3Abio+repos%3A%3E2+followers%3A%3E1&per_page=5',
        {
          items: [
            { url: 'https://api.github.com/users/nope1' },
            { url: 'https://api.github.com/users/nope2' },
          ],
        },
      ],
      [
        'https://api.github.com/users/nope1',
        {
          login: 'nope1',
          name: 'No Reply Studio',
          email: '12345+nope1@users.noreply.github.com',
          bio: 'Web Development Agency',
          html_url: 'https://github.com/nope1',
          followers: 5,
          public_repos: 4,
        },
      ],
      [
        'https://api.github.com/users/nope2',
        {
          login: 'nope2',
          name: 'Hidden Email Studio',
          email: null,
          bio: 'Creative agency',
          html_url: 'https://github.com/nope2',
          followers: 5,
          public_repos: 4,
        },
      ],
    ])

    const result = await findGroundedGithubProspect({
      query: '300EUR diagnostic freelancers small agencies',
      fetchImpl: async (url) =>
        new Response(JSON.stringify(responses.get(url) ?? {}), {
          status: responses.has(url) ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        }),
    })

    expect(result).toBeNull()
  })
})
