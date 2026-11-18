// Vercel function for the IS 403 admin site.
// vercel.json sends every /portal request here, and this file hands it to the Express app in admin-portal/.
import app from "../admin-portal/index.js";

export default app;
