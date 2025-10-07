admin = User.find_or_create_by!(email: "admin@example.com") do |user|
  user.password = "password"
  user.role = "admin"
end

seed_job = admin.jobs.find_or_initialize_by(problem_type: "Vehicle Routing", solver: "OR-Tools")
seed_job.assign_attributes(
  params: { "locations" => 12, "vehicle_capacity" => 15 },
  seed: 1_234,
  status: :succeeded,
  progress: 100,
  external_id: seed_job.external_id || "seed-job"
)
seed_job.save!

seed_result = seed_job.result || seed_job.build_result
seed_result.update!(
  metrics: { "objective_value" => 1_120, "iterations" => 24, "routes" => 3 },
  artifacts: [
    { "name" => "Seed solution", "url" => "https://example.com/artifacts/seed-solution.json" }
  ],
  duration: 1.2,
  cost: 9.5
)
