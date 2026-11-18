/**
 * Browser-side entry point for the Film Shop document-command parser.
 * Re-exports the exact module the edge functions use, so a typed command,
 * a spoken command and a LINE message parse identically.
 */
export * from '../../../supabase/functions/_shared/docCommandParser.ts';