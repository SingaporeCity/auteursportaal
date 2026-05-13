/**
 * Uniforme error-extractie voor `supabase.functions.invoke` aanroepen.
 *
 * Supabase-JS verpakt elke faal-respons in een van drie classes:
 *   - `FunctionsHttpError`  → niet-2xx-status (Edge Function draait wel, maar
 *     gaf zelf een error terug); response-body zit in `error.context`.
 *   - `FunctionsFetchError` → de browser kreeg de POST niet eens verstuurd
 *     (CORS-preflight gefaald, function niet gedeployed, netwerk down).
 *   - `FunctionsRelayError` → Supabase-relay tussen client en function had
 *     problemen.
 *
 * Standaard tonen al die drie maar één regel "Edge Function returned a non-2xx
 * status code" / "Failed to send a request" in de UI — wat voor admin niets
 * concreets oplevert. Deze helper:
 *   - Leest bij `FunctionsHttpError` de response-body uit (verwacht JSON met
 *     `{error}`-veld of tekst) zodat de specifieke server-foutmelding ("Missing
 *     required column: first_name") zichtbaar wordt.
 *   - Voegt bij `FunctionsFetchError` een hint toe over deployment + CORS.
 *
 * @module lib/edge-function-errors
 */

import {
  FunctionsHttpError,
  FunctionsFetchError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

export interface ExtractedFnError {
  /** Hoofdoorzaak — geschikt om in de UI te tonen. */
  message: string;
  /** Optionele suggestie aan de gebruiker, zoals "controleer of de function is gedeployed". */
  hint?: string;
  /** HTTP-status code als die bekend is (alleen bij `FunctionsHttpError`). */
  status?: number;
}

/**
 * Pak een nette `ExtractedFnError` uit `result.error` van een
 * `supabase.functions.invoke()` aanroep. Returnt `null` als er geen fout is.
 *
 * Async omdat we voor `FunctionsHttpError` de response-body asynchroon
 * uitlezen via `error.context.json()` / `.text()`.
 */
export async function extractFnError(errVal: unknown): Promise<ExtractedFnError | null> {
  if (errVal === null || errVal === undefined) {
    return null;
  }

  // -- HTTP-error: function draait, gaf niet-2xx terug; body bevat detail
  if (errVal instanceof FunctionsHttpError) {
    const ctx = errVal.context as Response | undefined;
    if (ctx !== undefined) {
      const detail = await readResponseDetail(ctx);
      if (detail !== null) {
        return { message: detail, status: ctx.status };
      }
      return { message: errVal.message, status: ctx.status };
    }
    return { message: errVal.message };
  }

  // -- Fetch-error: request kwam nooit aan; meest voorkomende oorzaak is
  // een nog-niet-gedeployde function (geen CORS-handler op OPTIONS-preflight),
  // gevolgd door netwerkproblemen.
  if (errVal instanceof FunctionsFetchError) {
    return {
      message: errVal.message,
      hint:
        'Controleer of de Edge Function is gedeployed (`supabase functions deploy <naam>`) ' +
        'en of de huidige origin in de CORS-allowlist van de function staat.',
    };
  }

  if (errVal instanceof FunctionsRelayError) {
    return {
      message: errVal.message,
      hint: 'Tijdelijk Supabase-platform-issue — probeer over een minuut opnieuw.',
    };
  }

  if (errVal instanceof Error) {
    return { message: errVal.message };
  }
  if (typeof errVal === 'string') {
    return { message: errVal };
  }
  return { message: 'Onbekende fout bij aanroepen Edge Function.' };
}

/**
 * Bouwt één regel UI-tekst uit een `ExtractedFnError`. Voegt de hint achter
 * de hoofdmessage met een "—" als die aanwezig is.
 */
export function formatFnErrorMessage(err: ExtractedFnError): string {
  if (err.hint !== undefined) {
    return `${err.message} — ${err.hint}`;
  }
  return err.message;
}

/**
 * Probeert een Response-body als JSON te lezen en daar de meest waarschijnlijke
 * tekstuele beschrijving uit te halen (`error`-veld is de conventie van onze
 * eigen Edge Functions). Valt terug op `text()`. Returnt `null` als de body
 * leeg of onleesbaar is.
 */
async function readResponseDetail(response: Response): Promise<string | null> {
  // Response kan maar één keer gelezen worden; we clonen eerst zodat een
  // eventuele fallback nog mogelijk is.
  const cloneForJson = response.clone();
  try {
    const body: unknown = await cloneForJson.json();
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const errField = body.error;
      if (typeof errField === 'string' && errField.length > 0) {
        return errField;
      }
    }
    // JSON zonder `error`-veld — geef de eerste 200 tekens van de raw body
    return JSON.stringify(body).slice(0, 200);
  } catch {
    // Niet-JSON body
  }

  try {
    const text = await response.text();
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return null;
    }
    return trimmed.slice(0, 500);
  } catch {
    return null;
  }
}
