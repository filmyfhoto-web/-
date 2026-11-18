/**
 * Browser-side re-export of the shared LINE job-message parser.
 * The canonical implementation lives next to the edge function so the
 * webhook and the UI can never drift apart.
 */
export * from "../../../supabase/functions/_shared/filmJobParser";
