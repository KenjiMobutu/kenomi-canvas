import { describe, expect, it } from 'vitest'
import { findGroundedGithubProspect } from './grounded-github'

describe('findGroundedGithubProspect', () => {
  it('returns the first grounded GitHub prospect with a public business email', async () => {
    const responses = new Map<string, unknown>([
      [
        'https://api.github.com/search/users?q=agency+studio+in%3Abio+repos%3A%3E2+followers%3A%3E1&per_page=10',
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
        'https://api.github.com/search/users?q=agency+studio+in%3Abio+repos%3A%3E2+followers%3A%3E1&per_page=10',
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

  it('skips already-contacted identities and returns the next grounded candidate', async () => {
    const responses = new Map<string, unknown>([
      [
        'https://api.github.com/search/users?q=agency+studio+in%3Abio+repos%3A%3E2+followers%3A%3E1&per_page=10',
        {
          items: [
            { url: 'https://api.github.com/users/agencyenterprise' },
            { url: 'https://api.github.com/users/freshworkstudio' },
          ],
        },
      ],
      [
        'https://api.github.com/users/agencyenterprise',
        {
          login: 'agencyenterprise',
          name: 'AE Studio',
          email: 'humanagency@ae.studio',
          bio: 'Building products to increase human agency',
          html_url: 'https://github.com/agencyenterprise',
          followers: 9,
          public_repos: 6,
        },
      ],
      [
        'https://api.github.com/users/freshworkstudio',
        {
          login: 'freshworkstudio',
          name: 'Freshwork Studio',
          email: 'gonzalo@freshworkstudio.com',
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
      exclude: {
        emails: ['humanagency@ae.studio'],
        sourceUrls: ['https://github.com/agencyenterprise'],
        companyNames: ['AE Studio'],
      },
      fetchImpl: async (url) =>
        new Response(JSON.stringify(responses.get(url) ?? {}), {
          status: responses.has(url) ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        }),
    })

    expect(result).not.toBeNull()
    expect(result).toMatchObject({
      company_name: 'Freshwork Studio',
      contact_email: 'gonzalo@freshworkstudio.com',
      source_url: 'https://github.com/freshworkstudio',
    })
  })

  it('keeps scanning later search results after excluded and invalid candidates', async () => {
    const responses = new Map<string, unknown>([
      [
        'https://api.github.com/search/users?q=agency+studio+in%3Abio+repos%3A%3E2+followers%3A%3E1&per_page=10',
        {
          items: [
            { url: 'https://api.github.com/users/agencyenterprise' },
            { url: 'https://api.github.com/users/freshworkstudio' },
            { url: 'https://api.github.com/users/invalid3' },
            { url: 'https://api.github.com/users/agency42' },
          ],
        },
      ],
      [
        'https://api.github.com/users/agencyenterprise',
        {
          login: 'agencyenterprise',
          name: 'AE Studio',
          email: 'humanagency@ae.studio',
          bio: 'Building products to increase human agency',
          html_url: 'https://github.com/agencyenterprise',
          followers: 9,
          public_repos: 6,
        },
      ],
      [
        'https://api.github.com/users/freshworkstudio',
        {
          login: 'freshworkstudio',
          name: 'Freshwork Studio',
          email: 'gonzalo@freshworkstudio.com',
          bio: 'Web Development Agency',
          html_url: 'https://github.com/freshworkstudio',
          followers: 12,
          public_repos: 8,
        },
      ],
      [
        'https://api.github.com/users/invalid3',
        {
          login: 'invalid3',
          name: 'Invalid Studio',
          email: null,
          bio: 'Creative agency',
          html_url: 'https://github.com/invalid3',
          followers: 5,
          public_repos: 4,
        },
      ],
      [
        'https://api.github.com/users/agency42',
        {
          login: 'agency42',
          name: 'Agency/42',
          email: 'hello@agency42.co',
          bio: 'ai innovation studio',
          html_url: 'https://github.com/agency42',
          followers: 11,
          public_repos: 10,
        },
      ],
    ])

    const result = await findGroundedGithubProspect({
      query: '300EUR diagnostic freelancers small agencies',
      exclude: {
        emails: ['humanagency@ae.studio', 'gonzalo@freshworkstudio.com'],
      },
      fetchImpl: async (url) =>
        new Response(JSON.stringify(responses.get(url) ?? {}), {
          status: responses.has(url) ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        }),
    })

    expect(result).not.toBeNull()
    expect(result).toMatchObject({
      company_name: 'Agency/42',
      contact_email: 'hello@agency42.co',
      source_url: 'https://github.com/agency42',
    })
  })

  it('extracts a public email from the profile website when the GitHub profile email is missing', async () => {
    const responses = new Map<string, { status: number; body: unknown; contentType?: string }>([
      [
        'https://api.github.com/search/users?q=agency+studio+in%3Abio+repos%3A%3E2+followers%3A%3E1&per_page=10',
        {
          status: 200,
          body: {
            items: [{ url: 'https://api.github.com/users/agency42' }],
          },
        },
      ],
      [
        'https://api.github.com/users/agency42',
        {
          status: 200,
          body: {
            login: 'agency42',
            name: 'Agency/42',
            email: null,
            bio: 'ai innovation studio',
            blog: 'https://agency42.co',
            html_url: 'https://github.com/agency42',
            followers: 11,
            public_repos: 10,
          },
        },
      ],
      [
        'https://agency42.co/',
        {
          status: 200,
          body: '<html><body><a href=\"/contact\">Contact</a></body></html>',
          contentType: 'text/html',
        },
      ],
      [
        'https://agency42.co/contact',
        {
          status: 200,
          body: '<html><body><a href=\"mailto:hello@agency42.co\">hello@agency42.co</a></body></html>',
          contentType: 'text/html',
        },
      ],
    ])

    const result = await findGroundedGithubProspect({
      query: '300EUR diagnostic freelancers small agencies',
      fetchImpl: async (url) => {
        const response = responses.get(url)
        return new Response(
          typeof response?.body === 'string' ? response.body : JSON.stringify(response?.body ?? {}),
          {
            status: response?.status ?? 404,
            headers: { 'Content-Type': response?.contentType ?? 'application/json' },
          }
        )
      },
    })

    expect(result).not.toBeNull()
    expect(result).toMatchObject({
      company_name: 'Agency/42',
      contact_email: 'hello@agency42.co',
      source_url: 'https://github.com/agency42',
    })
  })
})
