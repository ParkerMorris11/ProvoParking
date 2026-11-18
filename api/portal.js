// Vercel function for the IS 403 admin site.
// vercel.json sends every /portal request here, and this file hands it to the Express app in admin-portal/.
// "import" loads the Express app that admin-portal/index.js exports with module.exports.
import app from "../admin-portal/index.js";

// Vercel calls this exported app for every request, the same way app.listen() would locally.
export default app;
