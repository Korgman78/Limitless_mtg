import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import type { Article } from '../types'

// Fetch active sets for the filter dropdown
export function useActiveSets() {
  return useQuery({
    queryKey: ['activeSets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sets')
        .select('code, name')
        .eq('active', true)
        .order('start_date', { ascending: false })
      if (error) throw error
      return data || []
    },
  })
}

// Fetch articles with infinite scroll pagination
export function useArticles(setFilter: string) {
  const dateLimit = new Date()
  dateLimit.setDate(dateLimit.getDate() - 15)
  const dateLimitISO = dateLimit.toISOString()

  return useInfiniteQuery({
    queryKey: queryKeys.articles(setFilter),
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('press_articles')
        .select('*')
        .order('published_at', { ascending: false })

      if (setFilter !== 'All') {
        query = query.eq('set_tag', setFilter)
      }

      if (pageParam) {
        // Pagination: get articles older than the cursor
        query = query.lt('published_at', pageParam).limit(20)
      } else {
        // Initial load: get recent articles (last 15 days)
        query = query.gte('published_at', dateLimitISO)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (lastPage.length === 0) return undefined
      // For initial load, always allow loading more (older articles)
      // For paginated loads, stop if we got less than 20
      if (lastPage.length < 20 && lastPage.length > 0) {
        // Check if this was a paginated request (has older articles)
        return lastPage[lastPage.length - 1].published_at
      }
      if (lastPage.length === 0) return undefined
      return lastPage[lastPage.length - 1].published_at
    },
  })
}

// Fetch a single article (for refresh on open)
export function useArticle(articleId: string | number | null) {
  return useQuery({
    queryKey: queryKeys.article(articleId || 0),
    queryFn: async () => {
      if (!articleId) return null
      const { data, error } = await supabase
        .from('press_articles')
        .select('*')
        .eq('id', articleId)
        .single()
      if (error) throw error
      return data as Article
    },
    enabled: !!articleId,
  })
}

// Vote mutation with optimistic update
export function useVoteArticle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ articleId, voteType }: { articleId: number; voteType: 'yes' | 'meh' | 'no' }) => {
      const column = `votes_${voteType}`
      await supabase.rpc('increment_article_vote', {
        row_id: articleId,
        col_name: column,
      })
      return { articleId, voteType }
    },
    onSuccess: (_, { articleId }) => {
      // Invalidate the single article query to get fresh vote counts
      queryClient.invalidateQueries({ queryKey: queryKeys.article(articleId) })
    },
  })
}

// Persistent localStorage cache for Scryfall card name mappings
const SCRYFALL_CACHE_KEY = 'scryfall-card-names-cache'
const SCRYFALL_CACHE_VERSION = 1

interface ScryfallCache {
  version: number
  mappings: Record<string, string>
  timestamps: Record<string, number>
}

const getPersistedCache = (): ScryfallCache => {
  try {
    const cached = localStorage.getItem(SCRYFALL_CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (parsed.version === SCRYFALL_CACHE_VERSION) {
        return parsed
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { version: SCRYFALL_CACHE_VERSION, mappings: {}, timestamps: {} }
}

const saveToPersistedCache = (approxName: string, officialName: string) => {
  try {
    const cache = getPersistedCache()
    cache.mappings[approxName.toLowerCase()] = officialName
    cache.timestamps[approxName.toLowerCase()] = Date.now()

    // Cleanup old entries (older than 30 days) to prevent unbounded growth
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    Object.keys(cache.timestamps).forEach(key => {
      if (cache.timestamps[key] < thirtyDaysAgo) {
        delete cache.mappings[key]
        delete cache.timestamps[key]
      }
    })

    localStorage.setItem(SCRYFALL_CACHE_KEY, JSON.stringify(cache))
  } catch (e) {
    // Ignore storage errors
  }
}

const getCachedName = (approxName: string): string | null => {
  const cache = getPersistedCache()
  return cache.mappings[approxName.toLowerCase()] || null
}

// Fetch official card names from Scryfall with persistent caching
export function useScryfallCardNames(cardNames: string[], enabled: boolean) {
  return useQuery({
    queryKey: ['scryfall', cardNames.join(',')],
    queryFn: async () => {
      const mappings: Record<string, string> = {}
      const uncachedNames: string[] = []

      // Check persistent cache first
      cardNames.forEach(approxName => {
        const cached = getCachedName(approxName)
        if (cached) {
          mappings[approxName] = cached
        } else {
          uncachedNames.push(approxName)
        }
      })

      // Only fetch uncached names
      if (uncachedNames.length > 0) {
        await Promise.all(
          uncachedNames.map(async (approxName) => {
            try {
              const res = await fetch(
                `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(approxName)}`
              )
              if (res.ok) {
                const data = await res.json()
                mappings[approxName] = data.name
                saveToPersistedCache(approxName, data.name)
              }
            } catch (err) {
              console.error('Scryfall fetch error:', err)
            }
          })
        )
      }

      return mappings
    },
    enabled: enabled && cardNames.length > 0,
    staleTime: 24 * 60 * 60 * 1000, // Cache in React Query for 24h
  })
}
