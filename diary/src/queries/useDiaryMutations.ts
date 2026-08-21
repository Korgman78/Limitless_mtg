import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import type { EventType } from '../types'

/** Invalide la liste du set courant après toute écriture. */
function useInvalidate(setCode: string | null) {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.events(setCode ?? '') })
    queryClient.invalidateQueries({ queryKey: queryKeys.sets })
  }
}

export interface NewEventInput {
  set_code: string
  format: string
  event_type: EventType
  played_at: string
  wins: number
  losses: number
  /** Export MTGA du deck construit — devient la version 1. */
  decklist_raw?: string
  /** Export MTGA du pool complet (sealed uniquement). */
  poolCards?: { name: string; qty: number }[]
}

export function useCreateEvent(setCode: string | null) {
  const invalidate = useInvalidate(setCode)

  return useMutation({
    mutationFn: async (input: NewEventInput) => {
      const { decklist_raw, poolCards, ...eventFields } = input

      const { data, error } = await supabase
        .from('diary_events')
        .insert({ ...eventFields, source: 'manual' })
        .select('id')
        .single()

      if (error) throw error
      const eventId = data.id as string

      if (decklist_raw?.trim()) {
        const { error: deckError } = await supabase
          .from('diary_deck_versions')
          .insert({
            event_id: eventId,
            version_no: 1,
            label: 'Build initial',
            decklist_raw,
          })
        if (deckError) throw deckError
      }

      if (poolCards?.length) {
        const { error: poolError } = await supabase.from('diary_pool_cards').insert(
          poolCards.map((c) => ({
            event_id: eventId,
            card_name: c.name,
            qty: c.qty,
          })),
        )
        if (poolError) throw poolError
      }

      return eventId
    },
    onSuccess: invalidate,
  })
}

export function useUpdateEvent(setCode: string | null) {
  const invalidate = useInvalidate(setCode)

  return useMutation({
    mutationFn: async ({
      id,
      ...fields
    }: { id: string } & Partial<{
      wins: number
      losses: number
      played_at: string
      format: string
    }>) => {
      const { error } = await supabase.from('diary_events').update(fields).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Suppression douce : aucune policy DELETE n'existe sur diary_events. */
export function useDeleteEvent(setCode: string | null) {
  const invalidate = useInvalidate(setCode)

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('diary_events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSaveNote(setCode: string | null) {
  const invalidate = useInvalidate(setCode)

  return useMutation({
    mutationFn: async ({
      eventId,
      section,
      body,
    }: {
      eventId: string
      section: string
      body: string
    }) => {
      const { error } = await supabase
        .from('diary_notes')
        .upsert(
          { event_id: eventId, section, body, updated_at: new Date().toISOString() },
          { onConflict: 'event_id,section' },
        )
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useAddDeckVersion(setCode: string | null) {
  const invalidate = useInvalidate(setCode)

  return useMutation({
    mutationFn: async ({
      eventId,
      versionNo,
      label,
      decklistRaw,
    }: {
      eventId: string
      versionNo: number
      label: string
      decklistRaw: string
    }) => {
      const { error } = await supabase.from('diary_deck_versions').insert({
        event_id: eventId,
        version_no: versionNo,
        label: label || `Version ${versionNo}`,
        decklist_raw: decklistRaw,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
