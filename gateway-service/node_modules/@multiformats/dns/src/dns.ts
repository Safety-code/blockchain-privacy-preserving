import { CustomProgressEvent } from 'progress-events'
import { DNSQueryFailedError, EmptyDNSAnswerError } from './errors.ts'
import { defaultResolver } from './resolvers/default.ts'
import { cache } from './utils/cache.ts'
import { getTypes } from './utils/get-types.ts'
import type { DNS as DNSInterface, DNSInit, DNSResponse, QueryOptions, DNSResolverSorter } from './index.ts'
import type { DNSResolver } from './resolvers/index.ts'
import type { AnswerCache } from './utils/cache.ts'
import type { ComponentLogger } from '@libp2p/interface'

const DEFAULT_ANSWER_CACHE_SIZE = 1000
const RANDOM: DNSResolverSorter = () => (Math.random() > 0.5) ? -1 : 1

export class DNS implements DNSInterface {
  private readonly resolvers: Record<string, DNSResolver[]>
  private readonly cache: AnswerCache
  private readonly logger?: ComponentLogger
  private readonly sorter: DNSResolverSorter

  constructor (init: DNSInit) {
    this.resolvers = {}
    this.cache = cache(init.cacheSize ?? DEFAULT_ANSWER_CACHE_SIZE)
    this.logger = init.logger
    this.sorter = init.sorter ?? RANDOM

    Object.entries(init.resolvers ?? {}).forEach(([tld, resolver]) => {
      if (!Array.isArray(resolver)) {
        resolver = [resolver]
      }

      // convert `com` -> `com.`
      if (!tld.endsWith('.')) {
        tld = `${tld}.`
      }

      this.resolvers[tld] = resolver
    })

    // configure default resolver if none specified
    if (this.resolvers['.'] == null) {
      this.resolvers['.'] = defaultResolver()
    }
  }

  /**
   * Queries DNS resolvers for the passed record types for the passed domain.
   *
   * If cached records exist for all desired types they will be returned
   * instead.
   *
   * Any new responses will be added to the cache for subsequent requests.
   */
  async query (domain: string, options: QueryOptions = {}): Promise<DNSResponse> {
    const types = getTypes(options.types)
    const cached = options.cached !== false ? this.cache.get(domain, types) : undefined

    if (cached != null) {
      options.onProgress?.(new CustomProgressEvent<DNSResponse>('dns:cache', cached))

      return cached
    }

    const tld = `${domain.split('.').pop()}.`
    const resolvers = (this.resolvers[tld] ?? this.resolvers['.']).sort(this.sorter)

    const errors: Error[] = []

    for (const resolver of resolvers) {
      // skip further resolutions if the user aborted the signal
      if (options.signal?.aborted === true) {
        break
      }

      try {
        const result = await resolver(domain, {
          ...options,
          logger: this.logger,
          types
        })

        if (result.Answer.length === 0) {
          throw new EmptyDNSAnswerError('Query result had no answers')
        }

        for (const answer of result.Answer) {
          this.cache.add(domain, answer)
        }

        return result
      } catch (err: any) {
        errors.push(err)
        options.onProgress?.(new CustomProgressEvent<Error>('dns:error', err))
      }
    }

    throw new DNSQueryFailedError(errors, `DNS lookup of ${domain} ${types} failed`)
  }
}
