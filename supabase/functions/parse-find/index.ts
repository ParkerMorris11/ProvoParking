// parse-find: turns a plain-language (or spoken) trip description into the Find form fields.
//
//   POST { text, permit_ids, destination_ids, audio?: { data_base64, mime_type } }
//   -> { permit_id, use_saved_permit, destination_id, live, day, time, confidence }
//
// The model only suggests. IDs are checked against the lists the page sent, and the page still shows the
// form for review; eligibility is decided by the app's deterministic rules, never by this function.
//
// Setup: `supabase secrets set GEMINI_API_KEY=...` (optional: GEMINI_MODEL, ALLOWED_ORIGINS), then
// `supabase functions deploy parse-find`. SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase.
import { handleRequest } from "./handler.js";

Deno.serve((request: Request) =>
  handleRequest(request, {
    env: {
      GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY"),
      GEMINI_MODEL: Deno.env.get("GEMINI_MODEL"),
      SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
      SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
      ALLOWED_ORIGINS: Deno.env.get("ALLOWED_ORIGINS"),
    },
  })
);
