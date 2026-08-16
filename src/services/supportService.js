// src/services/supportService.js
// Supabase writes for support ticket child records: child tables
// support_ticket_replies / _notes / _attachments (RLS: staff of the
// ticket's gym may insert; members cannot).

let _supabaseClient = null
async function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient
  const m = await import('../lib/supabase')
  _supabaseClient = m.supabase
  return _supabaseClient
}

function mapSupabaseError(err, fallbackMsg) {
  const msg = (err && (err.message || err.details || err.hint)) || String(err || fallbackMsg || 'Supabase error')
  const codeStr = msg + ' ' + (err && err.code ? String(err.code) : '')
  const code =
    /42501|42502|42504|permission denied|row-level security|new row violates/i.test(codeStr) ? 'permission-denied'
    : /23505|duplicate key|already exists/i.test(codeStr) ? 'already-exists'
    : /PGRST116|404|not found/i.test(codeStr) ? 'not-found'
    : /network|fetch failed|ECONN|timeout|Failed to fetch/i.test(codeStr) ? 'unavailable'
    : /22P02|22007|23514|invalid input|invalid enum|violates check/i.test(codeStr) ? 'invalid-argument'
    : /23503|foreign key/i.test(codeStr) ? 'foreign-key-violation'
    : undefined
  const error = new Error(msg)
  if (code) error.code = code
  return error
}

export async function addSupportReply(ticketId, { text, by }) {
    const client = await getSupabaseClient()
    const { error } = await client.from('support_ticket_replies').insert({
      ticket_id: ticketId,
      author_uid: by || null,
      author_role: '',
      author_name: '',
      message: String(text || ''),
    })
    if (error) throw mapSupabaseError(error, 'Failed to save reply')
    return
}

export async function addSupportNote(ticketId, { text, by }) {
    const client = await getSupabaseClient()
    const { error } = await client.from('support_ticket_notes').insert({
      ticket_id: ticketId,
      author_uid: by || null,
      author_role: '',
      author_name: '',
      note: String(text || ''),
    })
    if (error) throw mapSupabaseError(error, 'Failed to save note')
    return
}

export async function addSupportAttachment(ticketId, { name, size, type }) {
    const client = await getSupabaseClient()
    const { error } = await client.from('support_ticket_attachments').insert({
      ticket_id: ticketId,
      name: String(name || ''),
      size: Number(size) || 0,
      type: String(type || ''),
    })
    if (error) throw mapSupabaseError(error, 'Failed to attach file')
    return
}
