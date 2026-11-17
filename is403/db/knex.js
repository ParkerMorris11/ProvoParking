// One shared Knex instance for the whole app.
const knexConfig = require("../knexfile");

const environment = process.env.NODE_ENV || "development";
const knex = require("knex")(knexConfig[environment]);

module.exports = knex;
