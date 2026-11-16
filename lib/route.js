/**
 * The exact HTTP route behind the composer button.
 *
 * The button needs the optimized text back inside the composer, so the result
 * cannot travel as a chat message. This route answers one JSON body with the
 * same record the tool returns, which keeps the two entry points in sync.
 */

export const ROUTE_PATH = '/api/prompt-optimizer/optimize'

const BODY_LIMIT = 20000

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/**
 * @param options.engine - the shared optimization engine
 * @param options.config - resolved plugin config
 * @param options.resolveSelection - returns the deployment's model selection, or undefined
 * @param options.language - plugin language for messages the engine does not localize
 */
export function createOptimizeRoute({ engine, config, resolveSelection, language }) {
  return async function optimizeRoute(request) {
    let body
    try {
      body = await request.json()
    } catch {
      return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'request body must be JSON' } }, 400)
    }
    if (body === null || typeof body !== 'object') {
      return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'request body must be a JSON object' } }, 400)
    }

    const text = typeof body.text === 'string' ? body.text : ''
    if (text.length > BODY_LIMIT) {
      return json({ ok: false, error: { code: 'TOO_LONG', message: 'text is too long for the composer route' } }, 413)
    }

    let selection
    try {
      selection = resolveSelection?.()
    } catch {
      selection = undefined
    }

    let result
    try {
      result = await engine.optimize(
        {
          text,
          mode: typeof body.mode === 'string' ? body.mode : undefined,
          goal: typeof body.goal === 'string' ? body.goal : undefined,
          template: typeof body.template === 'string' ? body.template : undefined,
          format: typeof body.format === 'string' ? body.format : undefined,
          language: typeof body.language === 'string' ? body.language : undefined,
        },
        { selection },
      )
    } catch (error) {
      return json({
        ok: false,
        error: { code: 'INTERNAL', message: String(error?.message ?? error) },
      })
    }

    return json({
      ok: result.ok === true,
      original: result.original,
      optimized: result.optimized,
      mode: result.mode,
      goal: result.goal,
      template: result.template,
      language: result.language ?? language,
      changes: result.changes ?? [],
      warnings: result.warnings ?? [],
      assumptions: result.assumptions ?? [],
      source: result.source ?? null,
      model: result.model ?? null,
      cached: result.cached === true,
      elapsedMs: result.elapsedMs ?? 0,
      error: result.error === null || result.error === undefined
        ? null
        : { code: String(result.error.code ?? 'INTERNAL'), message: String(result.error.message ?? '') },
    })
  }
}
