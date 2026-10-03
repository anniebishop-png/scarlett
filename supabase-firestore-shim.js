// A small Firestore-SDK-shaped wrapper around the Supabase JS client.
//
// Why this exists: the BECS board's logic (tracker-app.html, ported into index.html) was written
// against the Claude Artifact "db" capability, which mimics a tiny slice of the old Firestore JS
// SDK: db.collection(name).doc(id).set/update/delete/onSnapshot, collection(name).add(data),
// and collection(name).where(field, op, value)[...].get()/onSnapshot(). Reimplementing every call
// site against the Supabase client directly would mean touching hundreds of lines across the whole
// app and re-testing all of it. Instead, this file implements exactly that same small API on top of
// Supabase (Postgres + Realtime), so the rest of the app's code didn't need to change at all --
// only the one line that creates `db` changed (see the bottom of index.html's <script>).
//
// This is intentionally NOT a general Firestore-compatibility layer -- it only implements the
// handful of methods and comparison operators tracker-app.html actually calls. Grep it for
// ".where(", ".onSnapshot(", ".doc(", ".add(" if you ever need to extend it.
//
// Realtime note: rather than trying to diff individual row changes (which would need Postgres
// Realtime's single-column filter, and several of this app's queries filter on two or three
// columns at once -- something Realtime's filter syntax can't express), every subscription here
// just listens for "something changed on this table" and then re-runs the real filtered query
// through PostgREST (which supports arbitrary combinations of eq/gte/lte) to get a fresh, fully
// correct result set. For a small internal team tool like this, that's simpler and safer than a
// partial diff would be, and nobody will notice the difference.

function createFirestoreShim(supabaseClient) {
  let channelCounter = 0;

  function applyCondition(query, field, op, value) {
    switch (op) {
      case '==': return query.eq(field, value);
      case '!=': return query.neq(field, value);
      case '>=': return query.gte(field, value);
      case '<=': return query.lte(field, value);
      case '>': return query.gt(field, value);
      case '<': return query.lt(field, value);
      default: throw new Error('Unsupported where() operator in firestore shim: ' + op);
    }
  }

  function makeDocSnapshotList(rows) {
    return (rows || []).map(row => ({ id: row.id, data: () => row }));
  }

  // ---- query (collection, optionally filtered by one or more .where() calls) ----
  function makeQuery(table, conditions) {
    function runSelect() {
      let q = supabaseClient.from(table).select('*');
      conditions.forEach(([field, op, value]) => { q = applyCondition(q, field, op, value); });
      return q;
    }

    return {
      where(field, op, value) {
        return makeQuery(table, conditions.concat([[field, op, value]]));
      },

      async get() {
        const { data, error } = await runSelect();
        if (error) throw error;
        return { docs: makeDocSnapshotList(data) };
      },

      onSnapshot(onNext, onError) {
        let cancelled = false;
        const deliver = () => {
          runSelect().then(({ data, error }) => {
            if (cancelled) return;
            if (error) { if (onError) onError(error); return; }
            onNext({ docs: makeDocSnapshotList(data) });
          });
        };
        const channel = supabaseClient
          .channel('shim_' + table + '_' + (++channelCounter))
          .on('postgres_changes', { event: '*', schema: 'public', table }, deliver)
          .subscribe(status => {
            if (status === 'SUBSCRIBED') deliver(); // initial load, once the channel is actually live
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { if (onError) onError(new Error('Realtime subscription failed: ' + status)); }
          });
        return () => { cancelled = true; supabaseClient.removeChannel(channel); };
      },
    };
  }

  // ---- a single document reference ----
  function makeDocRef(table, id) {
    return {
      id,

      async set(data) {
        const { error } = await supabaseClient.from(table).upsert(Object.assign({ id }, data), { onConflict: 'id' });
        if (error) throw error;
      },

      async update(data) {
        // .select() makes Supabase return the rows it actually changed. Without it, an update that
        // row-level security silently filters out (or one aimed at a row that no longer exists)
        // comes back as a "success" with nothing saved -- which is exactly how a task could look
        // done on screen and then revert on refresh with no error anywhere.
        const { data: rows, error } = await supabaseClient.from(table).update(data).eq('id', id).select('id');
        if (error) throw error;
        if (!rows || rows.length === 0) {
          throw new Error('Nothing was saved to "' + table + '" (row ' + id + ') -- the row is missing or an UPDATE policy is blocking it.');
        }
      },

      // Insert only if this id doesn't exist yet; never overwrite an existing row. Used by the
      // auto-spawn routines (recurring tasks, show delivery tasks, client ops) so re-running them
      // can't reset a task someone has already marked done back to "not started".
      async create(data) {
        const { error } = await supabaseClient.from(table).upsert(Object.assign({ id }, data), { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw error;
      },

      async delete() {
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if (error) throw error;
      },

      onSnapshot(onNext, onError) {
        let cancelled = false;
        const deliver = () => {
          supabaseClient.from(table).select('*').eq('id', id).maybeSingle().then(({ data, error }) => {
            if (cancelled) return;
            if (error) { if (onError) onError(error); return; }
            onNext({ exists: !!data, id, data: () => data || {} });
          });
        };
        const channel = supabaseClient
          .channel('shim_doc_' + table + '_' + id + '_' + (++channelCounter))
          .on('postgres_changes', { event: '*', schema: 'public', table, filter: 'id=eq.' + id }, deliver)
          .subscribe(status => {
            if (status === 'SUBSCRIBED') deliver();
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { if (onError) onError(new Error('Realtime subscription failed: ' + status)); }
          });
        return () => { cancelled = true; supabaseClient.removeChannel(channel); };
      },
    };
  }

  // ---- a collection reference ----
  function makeCollectionRef(table) {
    const baseQuery = makeQuery(table, []);
    return {
      doc(id) { return makeDocRef(table, id); },

      async add(data) {
        const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2));
        const { error } = await supabaseClient.from(table).insert(Object.assign({ id }, data));
        if (error) throw error;
        return { id };
      },

      where(field, op, value) { return baseQuery.where(field, op, value); },
      get() { return baseQuery.get(); },
      onSnapshot(onNext, onError) { return baseQuery.onSnapshot(onNext, onError); },
    };
  }

  return {
    collection(name) { return makeCollectionRef(name); },
  };
}
