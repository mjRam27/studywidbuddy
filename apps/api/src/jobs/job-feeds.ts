import type { JobSource } from '@prisma/client';
import { z } from 'zod/v4';
import type { Env } from '../common/config/env';
import { stripHtml } from './job-skills';

/**
 * Job listings come only from official, public job-board APIs, used within their terms:
 * - Arbeitnow: free public API (EU + remote tech). Credit and a link back.
 * - Adzuna: free API key (India, UK, US …). Credit "Jobs by Adzuna".
 * Not used: Remotive (its terms forbid showing its jobs behind a signup, which our app
 * requires) and scraping sites like LinkedIn or Indeed (their terms forbid it).
 */
export interface NormalizedJob {
  source: JobSource;
  externalId: string;
  url: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  employment: string | null;
  description: string;
  tags: string[];
  postedAt: Date;
}

export abstract class JobFeedClient {
  /** Sources that can be fetched with the current configuration. */
  abstract sources(): JobSource[];
  abstract fetch(source: JobSource): Promise<NormalizedJob[]>;
}

const ArbeitnowPage = z.object({
  data: z.array(
    z.object({
      slug: z.string().min(1).max(300),
      company_name: z.string().max(300),
      title: z.string().min(1).max(300),
      description: z.string(),
      remote: z.boolean(),
      url: z.url(),
      tags: z.array(z.string()).default([]),
      job_types: z.array(z.string()).default([]),
      location: z.string().max(300),
      created_at: z.number(),
    }),
  ),
  links: z.object({ next: z.string().nullable() }).optional(),
});

const AdzunaPage = z.object({
  results: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      title: z.string().min(1),
      description: z.string().default(''),
      redirect_url: z.url(),
      created: z.string(),
      company: z.object({ display_name: z.string().optional() }).optional(),
      location: z.object({ display_name: z.string().optional() }).optional(),
      contract_time: z.string().optional(),
      category: z.object({ label: z.string().optional() }).optional(),
    }),
  ),
});

const ARBEITNOW_PAGES = 3;
const ADZUNA_PAGES = 2;
const REMOTE = /\b(remote|work from home|wfh)\b/i;

export class HttpJobFeedClient extends JobFeedClient {
  constructor(private readonly env: Env) {
    super();
  }

  sources(): JobSource[] {
    const out: JobSource[] = ['ARBEITNOW'];
    if (this.env.ADZUNA_APP_ID && this.env.ADZUNA_APP_KEY && this.env.ADZUNA_COUNTRIES.length) out.push('ADZUNA');
    return out;
  }

  async fetch(source: JobSource): Promise<NormalizedJob[]> {
    if (source === 'ARBEITNOW') return this.arbeitnow();
    if (source === 'ADZUNA') return this.adzuna();
    return [];
  }

  private async arbeitnow(): Promise<NormalizedJob[]> {
    const out: NormalizedJob[] = [];
    for (let page = 1; page <= ARBEITNOW_PAGES; page++) {
      const body = ArbeitnowPage.parse(await this.get(`https://www.arbeitnow.com/api/job-board-api?page=${page}`));
      for (const j of body.data) {
        out.push({
          source: 'ARBEITNOW',
          externalId: j.slug,
          url: j.url,
          title: j.title.trim(),
          company: j.company_name.trim() || 'Unknown company',
          location: j.location.trim() || (j.remote ? 'Remote' : 'Not stated'),
          remote: j.remote,
          employment: j.job_types.slice(0, 3).join(', ') || null,
          description: stripHtml(j.description),
          tags: j.tags.slice(0, 20),
          postedAt: new Date(j.created_at * 1000),
        });
      }
      if (!body.links?.next) break;
    }
    return out;
  }

  private async adzuna(): Promise<NormalizedJob[]> {
    const out: NormalizedJob[] = [];
    for (const country of this.env.ADZUNA_COUNTRIES) {
      for (let page = 1; page <= ADZUNA_PAGES; page++) {
        const u = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
        u.searchParams.set('app_id', this.env.ADZUNA_APP_ID!);
        u.searchParams.set('app_key', this.env.ADZUNA_APP_KEY!);
        u.searchParams.set('results_per_page', '50');
        u.searchParams.set('what_or', 'developer engineer programmer');
        u.searchParams.set('category', 'it-jobs');
        u.searchParams.set('sort_by', 'date');
        const body = AdzunaPage.parse(await this.get(u.toString(), `adzuna/${country}`));
        for (const j of body.results) {
          const description = stripHtml(j.description);
          out.push({
            source: 'ADZUNA',
            externalId: `${country}:${j.id}`,
            url: j.redirect_url,
            title: stripHtml(j.title, 300),
            company: j.company?.display_name?.trim() || 'Unknown company',
            location: j.location?.display_name?.trim() || country.toUpperCase(),
            remote: REMOTE.test(j.title) || REMOTE.test(description),
            employment: j.contract_time?.replace('_', ' ') ?? null,
            description,
            tags: j.category?.label ? [j.category.label] : [],
            postedAt: new Date(j.created),
          });
        }
        if (body.results.length < 50) break;
      }
    }
    return out;
  }

  /** GET JSON with a timeout. `label` keeps API keys in the query string out of logs and errors. */
  private async get(url: string, label = url): Promise<unknown> {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'StudywidBuddy job matcher' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`${label} answered ${res.status}`);
    return res.json();
  }
}
