import { validateGoals } from "../domain/admin.js";

export async function loadGoals(client) {
  const { data, error } = await client.rpc("get_admin_okr_goals");
  if (error) throw error;
  return { goals: validateGoals(data.goals), revision: data.revision };
}

export async function saveGoals(client, goals, revision) {
  const { data, error } = await client.rpc("save_admin_okr_goals", { goals: validateGoals(goals), expected_revision: revision });
  if (error) throw error;
  return { goals: validateGoals(data.goals), revision: data.revision };
}
